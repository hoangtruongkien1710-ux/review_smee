import "server-only";
import { prisma } from "./db";
import { isAdmin, type SessionUser } from "./auth";
import type { Prisma } from "@/generated/prisma/client";
import type { Annotation, CommentDTO, Person } from "./comment-dto";

const include = { author: { select: { id: true, name: true, color: true } } } satisfies Prisma.CommentInclude;
type Row = Prisma.CommentGetPayload<{ include: typeof include }>;

export function commentDTO(c: Row, replies: CommentDTO[] = [], fromVersionNo: number | null = null): CommentDTO {
  return {
    id: c.id,
    versionId: c.versionId,
    parentId: c.parentId,
    author: c.author,
    guestName: c.guestName,
    body: c.body,
    timeStart: c.timeStart,
    timeEnd: c.timeEnd,
    page: c.page,
    pinX: c.pinX,
    pinY: c.pinY,
    annotation: (c.annotation as Annotation | null) ?? null,
    internal: c.internal,
    resolved: c.resolved,
    createdAt: c.createdAt.toISOString(),
    edited: c.updatedAt.getTime() - c.createdAt.getTime() > 2000 && !c.resolvedAt,
    fromVersionNo,
    replies,
  };
}

/**
 * Comment của một phiên bản, dạng cây 1 cấp (comment gốc + trả lời).
 * Kèm các comment CHƯA XONG của phiên bản cũ hơn (để kiểm tra bản mới đã sửa chưa).
 * Khách không thấy comment nội bộ.
 */
export async function listComments(user: Pick<SessionUser, "role">, assetId: string, versionId: string) {
  const v = await prisma.version.findUnique({ where: { id: versionId }, select: { versionNo: true } });
  if (!v) return [];
  const base: Prisma.CommentWhereInput = user.role === "CLIENT" ? { internal: false } : {};
  const tops = await prisma.comment.findMany({
    where: {
      ...base,
      assetId,
      parentId: null,
      OR: [{ versionId }, { resolved: false, version: { versionNo: { lt: v.versionNo } } }],
    },
    include: { ...include, version: { select: { versionNo: true } } },
    orderBy: { createdAt: "asc" },
  });
  const replies = tops.length
    ? await prisma.comment.findMany({
        where: { ...base, parentId: { in: tops.map((t) => t.id) } },
        include,
        orderBy: { createdAt: "asc" },
      })
    : [];
  const byParent = new Map<string, Row[]>();
  for (const r of replies) byParent.set(r.parentId!, [...(byParent.get(r.parentId!) ?? []), r]);
  return tops.map((t) =>
    commentDTO(
      t,
      (byParent.get(t.id) ?? []).map((x) => commentDTO(x)),
      t.originVersionNo ?? (t.versionId !== versionId ? (t.version?.versionNo ?? null) : null),
    ),
  );
}

export const commentInclude = include;

/** Những người có thể được nhắc tên trong project: thành viên + quản trị. */
export async function projectPeople(projectId: string): Promise<Person[]> {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ role: { in: ["OWNER", "ADMIN", "MEMBER"] } }, { memberships: { some: { projectId } } }],
    },
    select: { id: true, name: true, color: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.name, color: u.color, email: u.email, client: u.role === "CLIENT" }));
}

/** Tạo thông báo trong app cho những người còn quyền xem project (bỏ qua người gửi). */
export async function notify(
  actor: { id?: string | null; name: string; color?: string | null },
  projectId: string,
  userIds: Iterable<string | null | undefined>,
  n: { text: string; excerpt?: string; link: string; internal?: boolean },
) {
  const ids = [...new Set([...userIds].filter((x): x is string => !!x && x !== actor.id))];
  if (!ids.length) return;
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: { id: true, role: true, memberships: { where: { projectId }, select: { role: true } } },
  });
  const ok = users.filter((u) => (isAdmin(u) || u.role === "MEMBER" || u.memberships.length > 0) && !(n.internal && u.role === "CLIENT"));
  if (!ok.length) return;
  await prisma.notification.createMany({
    data: ok.map((u) => ({
      userId: u.id,
      actorName: actor.name,
      actorColor: actor.color ?? null,
      text: n.text,
      excerpt: n.excerpt?.slice(0, 200),
      link: n.link,
    })),
  });
}
