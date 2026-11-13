import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { route } from "@/lib/api";
import { requireShare, requireSharedAsset } from "@/lib/share";
import { serveVersionFile } from "@/lib/serve-file";

type Ctx = { params: Promise<{ token: string; versionId: string; type: string }> };

/** File cho khách xem qua link chia sẻ (chỉ bản hiện tại của các file trong link). */
export const GET = route<Ctx>(async (req, { params }) => {
  const { token, versionId, type } = await params;
  const share = await requireShare(token);
  const v = await prisma.version.findUnique({ where: { id: versionId } });
  if (!v) throw new HttpError(404, "Không tìm thấy file");
  const a = await requireSharedAsset(share, v.assetId);
  if (a.currentVersionId !== v.id) throw new HttpError(404, "Không tìm thấy file");
  return serveVersionFile(req, v, type, { allowOriginal: share.allowDownload });
});
