import "server-only";
// Gửi file của một phiên bản (bản xem, thumbnail, trang PDF, file gốc), dùng chung cho nội bộ và link chia sẻ.
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { HttpError } from "./auth";
import { abs } from "./storage";
import * as drive from "./drive";

type V = {
  originalName: string;
  mimeType: string;
  originalKey: string | null;
  driveFileId: string | null;
  pagesKey: string | null;
  proxyKey: string | null;
  thumbKey: string | null;
  spriteKey: string | null;
  waveformKey: string | null;
};

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4a: "audio/mp4",
  jpg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  json: "application/json",
};

export function contentDisposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "") || "file";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Gửi file trên ổ VPS, hỗ trợ Range (tua video, tải tiếp). */
function sendFile(req: Request, file: string, mime: string, extra: Record<string, string> = {}) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new HttpError(404, "File không còn trên máy chủ");
  }
  const size = stat.size;
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    ...extra,
  };
  const range = req.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}


export async function serveVersionFile(req: Request, v: V, type: string, opts: { allowOriginal?: boolean } = {}) {
  if (type === "original") {
    if (opts.allowOriginal === false) throw new HttpError(403, "Link này không cho tải file gốc");
    const disp = contentDisposition(new URL(req.url).searchParams.get("inline") ? "inline" : "attachment", v.originalName);
    if (v.originalKey && fs.existsSync(abs(v.originalKey)))
      return sendFile(req, abs(v.originalKey), v.mimeType || "application/octet-stream", { "Content-Disposition": disp });
    if (v.driveFileId) {
      const r = await drive.download(v.driveFileId, req.headers.get("range"));
      if (!r.ok && r.status !== 206) throw new HttpError(502, "Không tải được file gốc từ Google Drive");
      const h = new Headers();
      for (const k of ["content-length", "content-range", "accept-ranges"]) {
        const val = r.headers.get(k);
        if (val) h.set(k, val);
      }
      h.set("Content-Type", v.mimeType || "application/octet-stream");
      h.set("Content-Disposition", disp);
      return new Response(r.body, { status: r.status, headers: h });
    }
    throw new HttpError(404, "File gốc không còn");
  }

  if (type === "page") {
    const n = Number(new URL(req.url).searchParams.get("n"));
    if (!v.pagesKey || !Number.isInteger(n) || n < 1) throw new HttpError(404, "Không có trang này");
    return sendFile(req, path.join(abs(v.pagesKey), `${n}.jpg`), "image/jpeg");
  }

  const key = { proxy: v.proxyKey, thumb: v.thumbKey, sprite: v.spriteKey, waveform: v.waveformKey }[type];
  if (key === undefined) throw new HttpError(400, "Loại file không hợp lệ");
  if (!key) throw new HttpError(404, "Chưa có bản xem");
  const ext = key.split(".").pop() ?? "";
  return sendFile(req, abs(key), MIME[ext] ?? "application/octet-stream");
}
