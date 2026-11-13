import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** Xử lý lại phiên bản hiện tại (khi lỗi). */
export const POST = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const a = await prisma.asset.findUnique({ where: { id }, include: { currentVersion: true } });
  if (!a?.currentVersion) throw new HttpError(404, "Không tìm thấy file");
  await requireProject(me, a.projectId, "EDITOR");
  if (!a.currentVersion.originalKey && !a.currentVersion.driveFileId) throw new HttpError(400, "File gốc không còn trên máy chủ để xử lý lại");
  await prisma.version.update({
    where: { id: a.currentVersion.id },
    data: { processingStatus: "QUEUED", processingError: null, progress: 0 },
  });
  return { ok: true };
});
