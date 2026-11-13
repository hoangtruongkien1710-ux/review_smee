import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { requestPreviewRestore } from "@/lib/preview-restore";

type Ctx = { params: Promise<{ id: string }> };

/** Tạo lại bản xem đã bị dọn để tiết kiệm ổ đĩa. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const v = await prisma.version.findUnique({ where: { id }, include: { asset: true } });
  if (!v || v.asset.deletedAt) throw new HttpError(404, "Không tìm thấy phiên bản");
  await requireProject(me, v.asset.projectId);
  return requestPreviewRestore(v.id);
});
