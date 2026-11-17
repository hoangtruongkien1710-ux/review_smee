import "server-only";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { dirs, rel, safeName } from "./storage";
import { extOf, kindOf } from "./kinds";
import { browserPlayable, probe } from "@/worker/media";
import type { Upload } from "@/generated/prisma/client";

/** Upload xong: tạo file (asset) hoặc phiên bản mới, chuyển file vào kho gốc và xếp hàng chờ xử lý. */
/** Đọc nhanh thông tin video vừa upload (vài trăm ms): file gốc phát thẳng được thì xem được ngay, không phải chờ nén. */
async function quickVideoInfo(file: string, fileName: string) {
  try {
    const info = await probe(file);
    return {
      durationSec: info.duration,
      fps: info.fps,
      width: info.width,
      height: info.height,
      originalPlayable: browserPlayable(info, extOf(fileName)),
    };
  } catch {
    return {};
  }
}

export async function finalizeUpload(u: Upload, partFile: string) {
  const kind = kindOf(u.fileName, u.mimeType);
  const early = kind === "VIDEO" ? await quickVideoInfo(partFile, u.fileName) : {};
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
        ...early,
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
