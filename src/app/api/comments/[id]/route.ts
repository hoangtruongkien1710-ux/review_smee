import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { can, requireProject } from "@/lib/access";
import { commentDTO, commentInclude, notify } from "@/lib/comments";
import { mentionIds, plainText } from "@/lib/comment-dto";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const c = await prisma.comment.findUnique({ where: { id }, include: { asset: true } });
  if (!c) throw new HttpError(404, "Không tìm thấy comment");
  return c;
}

const Body = z.object({
  body: z.string().trim().min(1, "Nội dung comment trống").max(5000).optional(),
  resolved: z.boolean().optional(),
});

/** Sửa nội dung (chỉ người viết) hoặc đánh dấu đã xử lý (ai comment được đều làm được). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const c = await load(id);
  await requireProject(me, c.asset.projectId, "COMMENTER");
  if (c.internal && me.role === "CLIENT") throw new HttpError(404, "Không tìm thấy comment");
  const b = await parse(req, Body);
  if (b.body !== undefined && c.authorId !== me.id) throw new HttpError(403, "Chỉ người viết mới sửa được comment");
  if (b.resolved !== undefined && c.parentId) throw new HttpError(400, "Chỉ đánh dấu xong ở comment gốc");

  const updated = await prisma.comment.update({
    where: { id },
    data: {
      body: b.body,
      ...(b.resolved === undefined ? {} : { resolved: b.resolved, resolvedAt: b.resolved ? new Date() : null }),
    },
    include: commentInclude,
  });

  const link = `/projects/${c.asset.projectId}/assets/${c.assetId}?c=${c.parentId ?? c.id}`;
  if (b.body !== undefined) {
    const before = new Set(mentionIds(c.body));
    const added = mentionIds(b.body).filter((x) => !before.has(x));
    await notify(me, c.asset.projectId, added, {
      text: `nhắc đến bạn ở “${c.asset.name}”`,
      excerpt: plainText(b.body),
      link,
      internal: c.internal,
    });
  }
  if (b.resolved === true && !c.resolved)
    await notify(me, c.asset.projectId, [c.authorId], {
      text: `đã đánh dấu xong comment của bạn ở “${c.asset.name}”`,
      excerpt: plainText(c.body),
      link,
      internal: c.internal,
    });
  return { comment: commentDTO(updated) };
});

/** Xoá comment: người viết hoặc quản lý project. Xoá comment gốc thì xoá cả trả lời. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const c = await load(id);
  const { role } = await requireProject(me, c.asset.projectId);
  if (c.authorId !== me.id && !can(role, "MANAGER")) throw new HttpError(403, "Bạn không xoá được comment của người khác");
  await prisma.comment.delete({ where: { id } });
  return { ok: true };
});
