import "server-only";
// Chuyển file / thư mục sang project khác. Comment, phiên bản, duyệt đi theo file; link chia sẻ của project cũ bị gỡ.
import { prisma } from "./db";
import { HttpError } from "./auth";
import { sync } from "./drive-sync";

export async function moveAssetsToProject(ids: string[], toProjectId: string, folderId: string | null) {
  if (folderId && !(await prisma.folder.findFirst({ where: { id: folderId, projectId: toProjectId } })))
    throw new HttpError(400, "Thư mục đích không tồn tại");
  await prisma.$transaction([
    // khách đang xem link chia sẻ của project cũ sẽ không còn thấy file đã chuyển đi
    prisma.shareLinkAsset.deleteMany({ where: { assetId: { in: ids } } }),
    prisma.asset.updateMany({ where: { id: { in: ids } }, data: { projectId: toProjectId, folderId } }),
  ]);
  ids.forEach((id) => sync.placeAsset(id));
}

/** Chuyển cả thư mục (kèm thư mục con và mọi file bên trong) sang project khác. */
export async function moveFolderToProject(folderId: string, toProjectId: string, parentId: string | null) {
  const f = await prisma.folder.findUniqueOrThrow({ where: { id: folderId } });
  if (parentId && !(await prisma.folder.findFirst({ where: { id: parentId, projectId: toProjectId } })))
    throw new HttpError(400, "Thư mục đích không tồn tại");
  const all = await prisma.folder.findMany({ where: { projectId: f.projectId }, select: { id: true, parentId: true } });
  const tree = [folderId];
  for (let i = 0; i < tree.length; i++) for (const c of all) if (c.parentId === tree[i]) tree.push(c.id);
  const assets = await prisma.asset.findMany({ where: { folderId: { in: tree } }, select: { id: true, deletedAt: true } });
  const assetIds = assets.map((a) => a.id);
  await prisma.$transaction([
    prisma.shareLinkFolder.deleteMany({ where: { folderId: { in: tree } } }),
    prisma.shareLinkAsset.deleteMany({ where: { assetId: { in: assetIds } } }),
    prisma.folder.updateMany({ where: { id: { in: tree } }, data: { projectId: toProjectId } }),
    prisma.folder.update({ where: { id: folderId }, data: { parentId } }),
    prisma.asset.updateMany({ where: { id: { in: assetIds } }, data: { projectId: toProjectId } }),
  ]);
  sync.moveFolder(folderId); // file đang dùng nằm trong thư mục Drive nên đi theo
  // file trong thùng rác nằm ở _Thùng rác của project cũ: đưa sang thùng rác của project mới
  assets.filter((a) => a.deletedAt).forEach((a) => sync.placeAsset(a.id));
}
