import "server-only";
// Gửi file của một phiên bản (bản xem, thumbnail, trang PDF, file gốc), dùng chung cho nội bộ và link chia sẻ.
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { HttpError } from "./auth";
import { abs } from "./storage";
import * as drive from "./drive";
import { prisma } from "./db";

type V = {
  id: string;
  lastViewedAt?: Date | null;
  originalName: string;
  mimeType: string;
  originalKey: string | null;
  driveFileId: string | null;
  pagesKey: string | null;
  proxyKey: string | null;
  thumbKey: string | null;
  spriteKey: string | null;
  waveformKey: string | null;
  sheetKey?: string | null;
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

/** Loại file được phép mở thẳng trong trình duyệt. HTML, SVG, JS... luôn bị tải về để không chạy được mã độc trên tên miền app. */
function safeInlineMime(mime: string) {
  const m = mime.toLowerCase().split(";")[0].trim();
  return (/^(image|video|audio)\//.test(m) && !m.includes("svg")) || m === "application/pdf";
}

/** Header chặn trình duyệt chạy mã trong file người dùng upload. */
const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
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
    ...SAFE_HEADERS,
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
    const inline = !!new URL(req.url).searchParams.get("inline") && safeInlineMime(v.mimeType || "");
    const disp = contentDisposition(inline ? "inline" : "attachment", v.originalName);
    // file không được phép mở trong trình duyệt: gửi dạng octet-stream để trình duyệt chỉ tải về
    const mime = inline ? v.mimeType : "application/octet-stream";
    if (v.originalKey && fs.existsSync(abs(v.originalKey)))
      return sendFile(req, abs(v.originalKey), mime, { "Content-Disposition": disp });
    if (v.driveFileId) {
      const r = await drive.download(v.driveFileId, req.headers.get("range"));
      if (!r.ok && r.status !== 206) throw new HttpError(502, "Không tải được file gốc từ Google Drive");
      const h = new Headers();
      for (const k of ["content-length", "content-range", "accept-ranges"]) {
        const val = r.headers.get(k);
        if (val) h.set(k, val);
      }
      h.set("Content-Type", mime);
      h.set("Content-Disposition", disp);
      for (const [k, val] of Object.entries(SAFE_HEADERS)) h.set(k, val);
      return new Response(r.body, { status: r.status, headers: h });
    }
    throw new HttpError(404, "File gốc không còn");
  }

  if (type === "page") {
    const n = Number(new URL(req.url).searchParams.get("n"));
    if (!v.pagesKey || !Number.isInteger(n) || n < 1) throw new HttpError(404, "Không có trang này");
    return sendFile(req, path.join(abs(v.pagesKey), `${n}.jpg`), "image/jpeg");
  }

  const key = { proxy: v.proxyKey, thumb: v.thumbKey, sprite: v.spriteKey, waveform: v.waveformKey, sheet: v.sheetKey ?? null }[type];
  if (key === undefined) throw new HttpError(400, "Loại file không hợp lệ");
  if (!key) throw new HttpError(404, "Chưa có bản xem");
  if (type === "proxy" && (!v.lastViewedAt || Date.now() - v.lastViewedAt.getTime() > 3600_000))
    // ghi nhận lần mở để tác vụ dọn ổ đĩa giữ lại file đang được xem
    void prisma.version.update({ where: { id: v.id }, data: { lastViewedAt: new Date() } }).catch(() => {});
  const ext = key.split(".").pop() ?? "";
  return sendFile(req, abs(key), MIME[ext] ?? "application/octet-stream");
}
