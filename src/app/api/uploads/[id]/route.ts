import fs from "node:fs";
import path from "node:path";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { dirs, removeQuiet } from "@/lib/storage";
import { finalizeUpload } from "@/lib/uploads";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, userId: string) {
  const u = await prisma.upload.findUnique({ where: { id } });
  if (!u || u.userId !== userId) throw new HttpError(404, "Phiên upload không tồn tại hoặc đã hết hạn");
  return u;
}

function partPath(id: string) {
  return path.join(dirs.uploads, `${id}.part`);
}

function received(id: string) {
  try {
    return fs.statSync(partPath(id)).size;
  } catch {
    return -1;
  }
}

/** Hỏi đã nhận được bao nhiêu byte (để upload tiếp khi rớt mạng). */
export const GET = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const u = await load(id, me.id);
  if (u.completed) return { receivedBytes: Number(u.size), completed: true, assetId: u.assetId, versionId: u.versionId };
  const r = received(id);
  if (r < 0) throw new HttpError(404, "Phiên upload đã hết hạn, hãy upload lại");
  return { receivedBytes: r, completed: false };
});

/** Nhận một khúc dữ liệu tại vị trí offset. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const u = await load(id, me.id);
  if (u.completed) return { receivedBytes: Number(u.size), completed: true, assetId: u.assetId, versionId: u.versionId };
  const offset = Number(new URL(req.url).searchParams.get("offset"));
  const have = received(id);
  if (have < 0) throw new HttpError(404, "Phiên upload đã hết hạn, hãy upload lại");
  if (offset !== have) return Response.json({ error: "Lệch vị trí", receivedBytes: have }, { status: 409 });
  const buf = Buffer.from(await req.arrayBuffer());
  const size = Number(u.size);
  if (buf.length > u.chunkSize || have + buf.length > size) throw new HttpError(400, "Khúc dữ liệu không hợp lệ");
  fs.appendFileSync(partPath(id), buf);
  const now = have + buf.length;
  if (now < size) return { receivedBytes: now, completed: false };
  const done = await finalizeUpload(u, partPath(id));
  return { receivedBytes: size, completed: true, ...done };
});

/** Huỷ upload. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const u = await load(id, me.id);
  if (!u.completed) {
    removeQuiet(partPath(id));
    await prisma.upload.delete({ where: { id } });
  }
  return { ok: true };
});
