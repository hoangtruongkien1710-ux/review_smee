import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { requireShare, requireSharedAsset } from "@/lib/share";
import { commentDTO, commentInclude, listComments, notify } from "@/lib/comments";
import { plainText } from "@/lib/comment-dto";
import { CommentBody } from "@/lib/comment-schema";

type Ctx = { params: Promise<{ token: string; assetId: string }> };

/** Comment khách thấy: của bản hiện tại, không có comment nội bộ. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { token, assetId } = await params;
  const share = await requireShare(token);
  const a = await requireSharedAsset(share, assetId);
  if (!a.currentVersionId) return { comments: [] };
  return { comments: await listComments({ role: "CLIENT" }, a.id, a.currentVersionId) };
});

const Body = CommentBody.extend({ guestName: z.string().trim().min(1, "Nhập tên của bạn").max(60) });

export const POST = route<Ctx>(async (req, { params }) => {
  const { token, assetId } = await params;
  const share = await requireShare(token);
  if (!share.allowComment) throw new HttpError(403, "Link này không cho comment");
  const a = await requireSharedAsset(share, assetId);
  const b = await parse(req, Body);
  if (b.versionId !== a.currentVersionId) throw new HttpError(400, "Phiên bản không hợp lệ");

  let parent = null;
  if (b.parentId) {
    parent = await prisma.comment.findUnique({ where: { id: b.parentId } });
    if (parent?.parentId) parent = await prisma.comment.findUnique({ where: { id: parent.parentId } });
    if (!parent || parent.assetId !== a.id || parent.internal) throw new HttpError(400, "Comment gốc không tồn tại");
  }
  let timeStart = parent ? null : (b.timeStart ?? null);
  let timeEnd = parent ? null : (b.timeEnd ?? null);
  if (timeStart != null && timeEnd != null && timeEnd < timeStart) [timeStart, timeEnd] = [timeEnd, timeStart];
  if (timeStart != null && timeEnd != null && timeEnd - timeStart < 0.01) timeEnd = null;
  // khách không nhắc tên được: bỏ mã @[..](..) nếu có
  const body = plainText(b.body);

  const c = await prisma.comment.create({
    data: {
      assetId: a.id,
      versionId: b.versionId,
      parentId: parent?.id ?? null,
      authorId: null,
      guestName: b.guestName,
      shareLinkId: share.id,
      body,
      timeStart,
      timeEnd: timeStart == null ? null : timeEnd,
      page: parent ? null : (b.page ?? null),
      pinX: parent ? null : (b.pinX ?? null),
      pinY: parent ? null : (b.pinY ?? null),
      annotation: parent || !b.annotation ? undefined : b.annotation,
      internal: false,
    },
    include: commentInclude,
  });

  const others = new Set<string | null>([a.assigneeId, a.createdById]);
  if (parent) {
    others.add(parent.authorId);
    const thread = await prisma.comment.findMany({ where: { parentId: parent.id }, select: { authorId: true } });
    thread.forEach((t) => others.add(t.authorId));
  }
  await notify({ name: `${b.guestName} (khách)` }, a.projectId, others, {
    text: parent ? `trả lời comment ở “${a.name}”` : `comment ở “${a.name}”`,
    excerpt: body,
    link: `/projects/${a.projectId}/assets/${a.id}?c=${parent?.id ?? c.id}`,
  });
  return { comment: commentDTO(c) };
});
