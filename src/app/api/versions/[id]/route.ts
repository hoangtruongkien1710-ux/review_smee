import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { removeVersionFiles } from "@/lib/files";
import { sync } from "@/lib/drive-sync";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const v = await prisma.version.findUnique({ where: { id }, include: { asset: true } });
  if (!v || v.asset.deletedAt) throw new HttpError(404, "Không tìm thấy phiên bản");
  return v;
}

const Body = z.object({ current: z.literal(true) });

/** Đặt làm phiên bản hiện tại (bản hiện trên lưới file, bản khách thấy đầu tiên). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const v = await load(id);
  await requireProject(me, v.asset.projectId, "EDITOR");
  await parse(req, Body);
  await prisma.asset.update({ where: { id: v.assetId }, data: { currentVersionId: v.id } });
  return { ok: true };
});

/** Xoá một phiên bản: bản xem trên máy chủ, file gốc vào Thùng rác Drive. Comment được chuyển sang bản khác. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const v = await load(id);
  await requireProject(me, v.asset.projectId, "EDITOR");
  const others = await prisma.version.findMany({
    where: { assetId: v.assetId, id: { not: v.id } },
    orderBy: { versionNo: "desc" },
    select: { id: true },
  });
  if (!others.length) throw new HttpError(400, "File chỉ còn 1 phiên bản. Muốn bỏ thì xoá cả file.");
  if (v.processingStatus === "PROCESSING") throw new HttpError(409, "Phiên bản đang được xử lý, đợi xong rồi xoá");
  // Comment của bản bị xoá được giữ lại: chuyển sang bản mới hơn gần nhất (không có thì bản cũ hơn gần nhất)
  const all = await prisma.version.findMany({ where: { assetId: v.assetId, id: { not: v.id } }, select: { id: true, versionNo: true } });
  const target =
    all.filter((x) => x.versionNo > v.versionNo).sort((a, b) => a.versionNo - b.versionNo)[0] ??
    all.sort((a, b) => b.versionNo - a.versionNo)[0];
  await prisma.$transaction(async (tx) => {
    if (v.asset.currentVersionId === v.id)
      await tx.asset.update({ where: { id: v.assetId }, data: { currentVersionId: others[0].id } });
    await tx.comment.updateMany({ where: { versionId: v.id, originVersionNo: null }, data: { originVersionNo: v.versionNo } });
    await tx.comment.updateMany({ where: { versionId: v.id }, data: { versionId: target.id } });
    await tx.version.delete({ where: { id: v.id } });
  });
  removeVersionFiles([v]);
  sync.deleteFiles([v.driveFileId]);
  return { ok: true };
});
