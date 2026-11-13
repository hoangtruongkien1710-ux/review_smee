import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { route } from "@/lib/api";
import { serveVersionFile } from "@/lib/serve-file";

type Ctx = { params: Promise<{ versionId: string; type: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { versionId, type } = await params;
  const v = await prisma.version.findUnique({ where: { id: versionId }, include: { asset: true } });
  if (!v) throw new HttpError(404, "Không tìm thấy file");
  await requireProject(me, v.asset.projectId);
  return serveVersionFile(req, v, type);
});
