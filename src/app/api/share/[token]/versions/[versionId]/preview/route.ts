import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { requireShare, requireSharedAsset } from "@/lib/share";
import { requestPreviewRestore } from "@/lib/preview-restore";

type Ctx = { params: Promise<{ token: string; versionId: string }> };

/** Khách mở file có bản xem đã bị dọn → tạo lại. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { token, versionId } = await params;
  const share = await requireShare(token);
  const v = await prisma.version.findUnique({ where: { id: versionId } });
  if (!v) throw new HttpError(404, "Không tìm thấy phiên bản");
  const a = await requireSharedAsset(share, v.assetId);
  if (a.currentVersionId !== v.id) throw new HttpError(404, "Không tìm thấy phiên bản");
  return requestPreviewRestore(v.id);
});
