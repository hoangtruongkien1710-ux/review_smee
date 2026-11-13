import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { dirs, ensureDirs } from "@/lib/storage";

const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_SIZE = 200 * 1024 ** 3; // 200 GB

const Body = z.object({
  projectId: z.string(),
  folderId: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(), // có = upload phiên bản mới
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().max(200).default(""),
  size: z.number().int().nonnegative().max(MAX_SIZE, "File quá lớn"),
});

/** Bắt đầu một phiên upload. */
export const POST = route(async (req) => {
  const me = await requireUser();
  const b = await parse(req, Body);
  await requireProject(me, b.projectId, "EDITOR");
  if (b.folderId && !(await prisma.folder.findFirst({ where: { id: b.folderId, projectId: b.projectId } })))
    throw new HttpError(400, "Thư mục không tồn tại");
  if (b.assetId && !(await prisma.asset.findFirst({ where: { id: b.assetId, projectId: b.projectId, deletedAt: null } })))
    throw new HttpError(400, "File gốc để thêm phiên bản không tồn tại");
  ensureDirs();
  const u = await prisma.upload.create({
    data: {
      userId: me.id,
      projectId: b.projectId,
      folderId: b.folderId ?? null,
      assetId: b.assetId ?? null,
      fileName: b.fileName,
      mimeType: b.mimeType,
      size: BigInt(b.size),
      chunkSize: CHUNK_SIZE,
    },
  });
  fs.writeFileSync(path.join(dirs.uploads, `${u.id}.part`), "");
  return { id: u.id, chunkSize: CHUNK_SIZE, receivedBytes: 0 };
});
