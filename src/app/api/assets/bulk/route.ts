import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { STATUSES } from "@/lib/statuses";
import { sync } from "@/lib/drive-sync";
import { removeVersionFiles } from "@/lib/files";

const Body = z.object({
  projectId: z.string(),
  ids: z.array(z.string()).min(1).max(500),
  action: z.enum(["trash", "restore", "delete", "move", "status"]),
  folderId: z.string().nullable().optional(),
  status: z.enum(STATUSES.map((s) => s.key) as [string, ...string[]]).optional(),
});

/** Thao tác trên nhiều file: xoá (vào thùng rác), khôi phục, xoá vĩnh viễn, di chuyển, đổi trạng thái. */
export const POST = route(async (req) => {
  const me = await requireUser();
  const b = await parse(req, Body);
  await requireProject(me, b.projectId, "EDITOR");
  const assets = await prisma.asset.findMany({ where: { id: { in: b.ids }, projectId: b.projectId } });
  const ids = assets.map((a) => a.id);
  const now = new Date();

  switch (b.action) {
    case "trash":
      await prisma.asset.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
      ids.forEach((id) => sync.placeAsset(id));
      break;
    case "restore": {
      // thư mục cũ đã bị xoá thì khôi phục về gốc project
      const folderIds = new Set(
        (await prisma.folder.findMany({ where: { projectId: b.projectId }, select: { id: true } })).map((f) => f.id),
      );
      for (const a of assets) {
        await prisma.asset.update({
          where: { id: a.id },
          data: { deletedAt: null, folderId: a.folderId && folderIds.has(a.folderId) ? a.folderId : null },
        });
        sync.placeAsset(a.id);
      }
      break;
    }
    case "delete": {
      const trashed = assets.filter((a) => a.deletedAt);
      if (trashed.length !== assets.length) throw new HttpError(400, "Chỉ xoá vĩnh viễn được file đã ở trong thùng rác");
      const versions = await prisma.version.findMany({ where: { assetId: { in: ids } } });
      await prisma.asset.deleteMany({ where: { id: { in: ids } } });
      removeVersionFiles(versions);
      sync.deleteFiles(versions.flatMap((v) => [v.driveFileId, v.proxyDriveId]));
      break;
    }
    case "move": {
      if (b.folderId && !(await prisma.folder.findFirst({ where: { id: b.folderId, projectId: b.projectId } })))
        throw new HttpError(400, "Thư mục đích không tồn tại");
      await prisma.asset.updateMany({ where: { id: { in: ids } }, data: { folderId: b.folderId ?? null } });
      ids.forEach((id) => sync.placeAsset(id));
      break;
    }
    case "status":
      if (!b.status) throw new HttpError(400, "Thiếu trạng thái");
      await prisma.asset.updateMany({ where: { id: { in: ids } }, data: { status: b.status } });
      break;
  }
  await prisma.project.update({ where: { id: b.projectId }, data: { updatedAt: now } });
  return { ok: true, count: ids.length };
});
