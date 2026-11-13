import "server-only";
// Xếp hàng tạo lại bản xem đã bị dọn (worker tải file gốc từ Drive về rồi xử lý lại).
import { prisma } from "./db";
import { HttpError } from "./auth";

export async function requestPreviewRestore(versionId: string) {
  const v = await prisma.version.findUnique({
    where: { id: versionId },
    select: { previewPurgedAt: true, proxyKey: true, processingStatus: true, driveFileId: true },
  });
  if (!v) throw new HttpError(404, "Không tìm thấy phiên bản");
  if (!v.previewPurgedAt || v.proxyKey) return { queued: false };
  if (v.processingStatus !== "READY") return { queued: true };
  if (!v.driveFileId) throw new HttpError(409, "Không còn file gốc để tạo lại bản xem");
  await prisma.version.updateMany({
    where: { id: versionId, processingStatus: "READY", previewPurgedAt: { not: null } },
    data: { processingStatus: "QUEUED", progress: 0, processingError: null },
  });
  return { queued: true };
}
