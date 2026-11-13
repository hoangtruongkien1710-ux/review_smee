// Giữ cấu trúc thư mục trên Google Drive giống trong app (app là nơi quản lý chính).
// Mọi hàm ở đây "cố gắng hết sức": lỗi Drive chỉ ghi log, không làm hỏng thao tác trong app.
import { prisma } from "./prisma-core";
import * as drive from "./drive";
import { extOf } from "./kinds";

const TRASH_NAME = "_Thùng rác";

export async function projectFolder(projectId: string): Promise<string> {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (p.driveFolderId) return p.driveFolderId;
  const id = await drive.createFolder(p.name, drive.driveRoot());
  await prisma.project.update({ where: { id: projectId }, data: { driveFolderId: id } });
  return id;
}

export async function folderDriveId(folderId: string): Promise<string> {
  const f = await prisma.folder.findUniqueOrThrow({ where: { id: folderId } });
  if (f.driveFolderId) return f.driveFolderId;
  const parent = f.parentId ? await folderDriveId(f.parentId) : await projectFolder(f.projectId);
  const id = await drive.createFolder(f.name, parent);
  await prisma.folder.update({ where: { id: folderId }, data: { driveFolderId: id } });
  return id;
}

export async function trashFolder(projectId: string): Promise<string> {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (p.driveTrashFolderId) return p.driveTrashFolderId;
  const id = await drive.ensureFolder(TRASH_NAME, await projectFolder(projectId));
  await prisma.project.update({ where: { id: projectId }, data: { driveTrashFolderId: id } });
  return id;
}

export async function assetParent(asset: { projectId: string; folderId: string | null }) {
  return asset.folderId ? folderDriveId(asset.folderId) : projectFolder(asset.projectId);
}

/** Tên file trên Drive cho một phiên bản: V1 giữ tên gốc, V2+ thêm hậu tố _v2. */
export function driveFileName(assetName: string, originalName: string, versionNo: number) {
  if (versionNo <= 1) return originalName;
  const ext = extOf(originalName);
  const base = assetName.replace(new RegExp(`\\.${ext}$`, "i"), "");
  return `${base}_v${versionNo}${ext ? "." + ext : ""}`;
}

function bg(label: string, fn: () => Promise<unknown>) {
  if (!drive.driveEnabled()) return;
  fn().catch((e) => console.error(`[drive] ${label}:`, (e as Error).message));
}

export const sync = {
  renameProject(projectId: string, name: string) {
    bg("đổi tên project", async () => {
      const p = await prisma.project.findUnique({ where: { id: projectId } });
      if (p?.driveFolderId) await drive.rename(p.driveFolderId, name);
    });
  },
  renameFolder(folderId: string, name: string) {
    bg("đổi tên thư mục", async () => {
      const f = await prisma.folder.findUnique({ where: { id: folderId } });
      if (f?.driveFolderId) await drive.rename(f.driveFolderId, name);
    });
  },
  moveFolder(folderId: string) {
    bg("di chuyển thư mục", async () => {
      const f = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!f?.driveFolderId) return;
      const parent = f.parentId ? await folderDriveId(f.parentId) : await projectFolder(f.projectId);
      await drive.move(f.driveFolderId, parent);
    });
  },
  /** Thư mục bị xoá trong app: dời file vào _Thùng rác của project trước, rồi đưa thư mục Drive vào thùng rác của Drive. */
  deleteFolder(projectId: string, assetIds: string[], driveFolderIds: (string | null)[]) {
    bg("xoá thư mục", async () => {
      if (assetIds.length) {
        const trash = await trashFolder(projectId);
        const versions = await prisma.version.findMany({ where: { assetId: { in: assetIds }, driveFileId: { not: null } } });
        for (const v of versions) await drive.move(v.driveFileId!, trash);
      }
      for (const id of driveFolderIds) if (id) await drive.trash(id).catch(() => {});
    });
  },
  renameAsset(assetId: string) {
    bg("đổi tên file", async () => {
      const a = await prisma.asset.findUnique({ where: { id: assetId }, include: { versions: true } });
      if (!a) return;
      for (const v of a.versions) {
        if (!v.driveFileId) continue;
        const name = driveFileName(a.name, v.versionNo <= 1 ? a.name : v.originalName, v.versionNo);
        await drive.rename(v.driveFileId, name);
      }
    });
  },
  /** Chuyển các file của asset tới đúng chỗ: thư mục hiện tại, hoặc _Thùng rác nếu đã xoá. */
  placeAsset(assetId: string) {
    bg("di chuyển file", async () => {
      const a = await prisma.asset.findUnique({ where: { id: assetId }, include: { versions: true } });
      if (!a) return;
      const target = a.deletedAt ? await trashFolder(a.projectId) : await assetParent(a);
      for (const v of a.versions) if (v.driveFileId) await drive.move(v.driveFileId, target);
    });
  },
  deleteFiles(driveFileIds: (string | null)[]) {
    bg("xoá vĩnh viễn", async () => {
      for (const id of driveFileIds) if (id) await drive.remove(id);
    });
  },
};
