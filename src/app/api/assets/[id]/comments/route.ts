import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { commentDTO, commentInclude, listComments, notify } from "@/lib/comments";
import { mentionIds, plainText } from "@/lib/comment-dto";
import { CommentBody } from "@/lib/comment-schema";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const a = await prisma.asset.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, "Không tìm thấy file");
  await requireProject(me, a.projectId);
  const versionId = new URL(req.url).searchParams.get("versionId") ?? a.currentVersionId;
  if (!versionId) return { comments: [] };
  return { comments: await listComments(me, id, versionId) };
});

const Body = CommentBody;

export const POST = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const a = await prisma.asset.findUnique({ where: { id } });
  if (!a || a.deletedAt) throw new HttpError(404, "Không tìm thấy file");
  await requireProject(me, a.projectId, "COMMENTER");
  const b = await parse(req, Body);
  const v = await prisma.version.findUnique({ where: { id: b.versionId } });
  if (!v || v.assetId !== id) throw new HttpError(400, "Phiên bản không hợp lệ");

  let parent = null;
  if (b.parentId) {
    parent = await prisma.comment.findUnique({ where: { id: b.parentId } });
    if (!parent || parent.assetId !== id) throw new HttpError(400, "Comment gốc không tồn tại");
    if (parent.parentId) parent = await prisma.comment.findUniqueOrThrow({ where: { id: parent.parentId } });
    if (parent.internal && me.role === "CLIENT") throw new HttpError(404, "Comment gốc không tồn tại");
  }
  const internal = me.role === "CLIENT" ? false : parent ? parent.internal : !!b.internal;
  let timeStart = parent ? null : (b.timeStart ?? null);
  let timeEnd = parent ? null : (b.timeEnd ?? null);
  if (timeStart != null && timeEnd != null && timeEnd < timeStart) [timeStart, timeEnd] = [timeEnd, timeStart];
  if (timeStart != null && timeEnd != null && timeEnd - timeStart < 0.01) timeEnd = null;

  const c = await prisma.comment.create({
    data: {
      assetId: id,
      versionId: v.id,
      parentId: parent?.id ?? null,
      authorId: me.id,
      body: b.body,
      timeStart,
      timeEnd: timeStart == null ? null : timeEnd,
      page: parent ? null : (b.page ?? null),
      pinX: parent ? null : (b.pinX ?? null),
      pinY: parent ? null : (b.pinY ?? null),
      annotation: parent || !b.annotation ? undefined : b.annotation,
      internal,
    },
    include: commentInclude,
  });

  // Thông báo
  const link = `/projects/${a.projectId}/assets/${id}?c=${parent?.id ?? c.id}`;
  const excerpt = plainText(b.body);
  const mentioned = mentionIds(b.body);
  await notify(me, a.projectId, mentioned, { text: `nhắc đến bạn ở “${a.name}”`, excerpt, link, internal });
  const others = new Set<string | null>();
  if (parent) {
    others.add(parent.authorId);
    const thread = await prisma.comment.findMany({ where: { parentId: parent.id }, select: { authorId: true } });
    thread.forEach((t) => others.add(t.authorId));
  } else {
    others.add(a.assigneeId);
    others.add(a.createdById);
  }
  mentioned.forEach((m) => others.delete(m));
  await notify(me, a.projectId, others, {
    text: parent ? `trả lời comment ở “${a.name}”` : `comment ở “${a.name}”`,
    excerpt,
    link,
    internal,
  });

  // Nhóm Telegram chung: không gửi từng comment, worker gom lại thành bản tin (src/worker/telegram-digest.ts)

  return { comment: commentDTO(c) };
});
