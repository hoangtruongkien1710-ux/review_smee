import "server-only";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { dirs, rel, safeName } from "./storage";
import { kindOf } from "./kinds";
import type { Upload } from "@/generated/prisma/client";

/** Upload xong: tạo file (asset) hoặc phiên bản mới, chuyển file vào kho gốc và xếp hàng chờ xử lý. */
export async function finalizeUpload(u: Upload, partFile: string) {
  const kind = kindOf(u.fileName, u.mimeType);
  const result = await prisma.$transaction(async (tx) => {
    let assetId = u.assetId;
    let versionNo = 1;
    if (assetId) {
      const last = await tx.version.findFirst({ where: { assetId }, orderBy: { versionNo: "desc" } });
      versionNo = (last?.versionNo ?? 0) + 1;
    } else {
      const a = await tx.asset.create({
        data: {
          projectId: u.projectId,
          folderId: u.folderId,
          name: u.fileName,
          kind,
          createdById: u.userId,
        },
      });
      assetId = a.id;
    }
    const v = await tx.version.create({
      data: {
        assetId,
        versionNo,
        originalName: u.fileName,
        mimeType: u.mimeType || "application/octet-stream",
        kind,
        size: u.size,
        processingStatus: "QUEUED",
        uploadedById: u.userId,
      },
    });
    const dir = path.join(dirs.originals, v.id);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, safeName(u.fileName));
    fs.renameSync(partFile, dest);
    await tx.version.update({ where: { id: v.id }, data: { originalKey: rel(dest) } });
    await tx.asset.update({ where: { id: assetId }, data: { currentVersionId: v.id, kind, updatedAt: new Date() } });
    await tx.upload.update({ where: { id: u.id }, data: { completed: true, assetId, versionId: v.id, receivedBytes: u.size } });
    await tx.project.update({ where: { id: u.projectId }, data: { updatedAt: new Date() } });
    return { assetId, versionId: v.id };
  });
  return result;
}
