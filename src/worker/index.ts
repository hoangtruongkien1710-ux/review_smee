// Worker xử lý file sau khi upload: tạo bản xem, thumbnail, ảnh scrub, sóng âm, PDF xem trước,
// rồi đẩy file gốc lên Google Drive. Chạy: npm run worker
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma-core.ts";
import { abs, dirs, ensureDirs, mediaDir, rel, removeQuiet } from "../lib/storage.ts";
import { extOf } from "../lib/kinds.ts";
import * as drive from "../lib/drive.ts";
import { assetParent, driveFileName } from "../lib/drive-sync.ts";
import * as m from "./media.ts";
import { runTelegramBot } from "./telegram-bot.ts";
import { runTelegramDigest } from "./telegram-digest.ts";

const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 2));
const MAX_PDF_PAGES = Number(process.env.MAX_PDF_PAGES || 300);
const KEEP_ORIGINALS = process.env.KEEP_LOCAL_ORIGINALS === "true";
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...a);

async function claim(): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Version" SET "processingStatus" = 'PROCESSING', progress = 0, "processingError" = NULL
    WHERE id = (
      SELECT id FROM "Version" WHERE "processingStatus" = 'QUEUED'
      ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  return rows[0]?.id ?? null;
}

let lastProgressWrite = 0;
async function setProgress(id: string, pct: number, force = false) {
  if (!force && Date.now() - lastProgressWrite < 1500) return;
  lastProgressWrite = Date.now();
  await prisma.version.update({ where: { id }, data: { progress: Math.round(pct) } }).catch(() => {});
}

async function processVersion(id: string) {
  const v = await prisma.version.findUniqueOrThrow({ where: { id }, include: { asset: true } });
  if (!v.originalKey) throw new Error("Không còn file gốc trên máy chủ");
  const input = abs(v.originalKey);
  if (!fs.existsSync(input)) throw new Error("Không tìm thấy file gốc trên máy chủ");
  const out = mediaDir(id);
  fs.mkdirSync(out, { recursive: true });
  const work = path.join(dirs.tmp, id);
  fs.mkdirSync(work, { recursive: true });
  const data: Record<string, unknown> = {};
  const ext = extOf(v.originalName);

  try {
    switch (v.kind) {
      case "VIDEO": {
        const info = await m.probe(input);
        Object.assign(data, { durationSec: info.duration, fps: info.fps, width: info.width, height: info.height });
        if (!info.hasVideo) throw new Error("File không có hình (có thể là file audio)");
        const proxy = path.join(out, "proxy.mp4");
        await m.videoProxy(input, proxy, info, (p) => setProgress(id, p * 0.9));
        const dur = info.duration ?? (await m.probe(proxy)).duration ?? 0;
        await m.frameAt(proxy, Math.min(dur * 0.1, 3), path.join(out, "thumb.jpg"));
        data.proxyKey = rel(proxy);
        data.thumbKey = rel(path.join(out, "thumb.jpg"));
        if (dur > 0) {
          const s = await m.sprite(proxy, dur, path.join(out, "sprite.jpg"));
          Object.assign(data, { spriteKey: rel(path.join(out, "sprite.jpg")), spriteCols: s.cols, spriteCount: s.count });
        }
        break;
      }
      case "AUDIO": {
        const info = await m.probe(input);
        data.durationSec = info.duration;
        const proxy = path.join(out, "proxy.m4a");
        await m.audioProxy(input, proxy);
        await setProgress(id, 70, true);
        await m.waveform(proxy, path.join(out, "waveform.json"));
        Object.assign(data, { proxyKey: rel(proxy), waveformKey: rel(path.join(out, "waveform.json")) });
        break;
      }
      case "IMAGE": {
        if (ext === "svg" || ext === "gif") {
          const p = path.join(out, `preview.${ext}`);
          fs.copyFileSync(input, p);
          data.proxyKey = rel(p);
          if (ext === "gif") {
            await m.frameAt(input, 0, path.join(out, "thumb.jpg"));
            data.thumbKey = rel(path.join(out, "thumb.jpg"));
          } else data.thumbKey = rel(p);
        } else {
          const p = path.join(out, "preview.jpg");
          await m.imagePreview(input, p);
          data.proxyKey = rel(p);
          await m.frameAt(p, 0, path.join(out, "thumb.jpg"));
          data.thumbKey = rel(path.join(out, "thumb.jpg"));
        }
        const info = await m.probe(abs(data.proxyKey as string)).catch(() => null);
        if (info) Object.assign(data, { width: info.width, height: info.height });
        break;
      }
      case "PDF":
      case "DOCUMENT": {
        const pdf = path.join(out, "preview.pdf");
        if (v.kind === "PDF") fs.copyFileSync(input, pdf);
        else {
          // LibreOffice cần đuôi file đúng để nhận dạng
          const named = path.join(work, `input.${ext || "bin"}`);
          fs.copyFileSync(input, named);
          await m.officeToPdf(named, pdf, work);
        }
        await setProgress(id, 70, true);
        const info = await m.pdfInfo(pdf);
        data.pageCount = info.pages;
        data.proxyKey = rel(pdf);
        await m.pdfThumb(pdf, path.join(out, "thumb.jpg")).catch(() => {});
        if (info.pages) {
          const dir = path.join(out, "pages");
          const n = Math.min(info.pages, MAX_PDF_PAGES);
          await m
            .pdfPages(pdf, dir, n, (p) => setProgress(id, 70 + p * 28))
            .then(() => (data.pagesKey = rel(dir)))
            .catch((e) => log(`không tạo được ảnh trang: ${(e as Error).message}`));
        }
        if (fs.existsSync(path.join(out, "thumb.jpg"))) data.thumbKey = rel(path.join(out, "thumb.jpg"));
        break;
      }
      default:
        // File khác: không có trình xem, chỉ lưu và cho tải về
        break;
    }
  } finally {
    removeQuiet(work);
  }
  await prisma.version.update({ where: { id }, data: { ...data, processingStatus: "READY", progress: 100 } });
  log(`xong ${v.kind} ${v.originalName}`);
  await pushToDrive(id);
}

/** Đẩy file gốc lên Google Drive, xong thì xoá bản trên VPS. */
async function pushToDrive(id: string) {
  if (!drive.driveEnabled()) return;
  const v = await prisma.version.findUnique({ where: { id }, include: { asset: true } });
  if (!v || v.driveFileId || !v.originalKey) return;
  const file = abs(v.originalKey);
  if (!fs.existsSync(file)) return;
  try {
    const parent = await assetParent(v.asset);
    const name = driveFileName(v.asset.name, v.originalName, v.versionNo);
    const fileId = await drive.uploadFile(file, name, v.mimeType, parent);
    await prisma.version.update({ where: { id }, data: { driveFileId: fileId, ...(KEEP_ORIGINALS ? {} : { originalKey: null }) } });
    if (!KEEP_ORIGINALS) removeQuiet(path.dirname(file));
    log(`đã đẩy lên Drive: ${name}`);
  } catch (e) {
    log(`đẩy lên Drive lỗi (sẽ thử lại sau): ${(e as Error).message}`);
  }
}

async function loop(slot: number) {
  for (;;) {
    let id: string | null = null;
    try {
      id = await claim();
      if (!id) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      log(`[${slot}] bắt đầu ${id}`);
      await processVersion(id);
    } catch (e) {
      const msg = (e as Error).message;
      log(`[${slot}] lỗi ${id ?? ""}: ${msg}`);
      if (id)
        await prisma.version
          .update({ where: { id }, data: { processingStatus: "FAILED", processingError: msg.slice(0, 1000) } })
          .catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** Định kỳ: thử đẩy lại các file chưa lên Drive, dọn phiên upload bỏ dở quá 3 ngày. */
async function housekeeping() {
  try {
    if (drive.driveEnabled()) {
      const pending = await prisma.version.findMany({
        where: { processingStatus: "READY", driveFileId: null, originalKey: { not: null } },
        select: { id: true },
        take: 20,
      });
      for (const p of pending) await pushToDrive(p.id);
    }
    const old = await prisma.upload.findMany({
      where: { completed: false, updatedAt: { lt: new Date(Date.now() - 3 * 86400_000) } },
      select: { id: true },
    });
    for (const u of old) {
      removeQuiet(path.join(dirs.uploads, `${u.id}.part`));
      await prisma.upload.delete({ where: { id: u.id } }).catch(() => {});
    }
  } catch (e) {
    log("housekeeping lỗi:", (e as Error).message);
  }
}

async function main() {
  ensureDirs();
  // Job đang dở khi worker bị tắt → xếp hàng lại
  const reset = await prisma.version.updateMany({ where: { processingStatus: "PROCESSING" }, data: { processingStatus: "QUEUED" } });
  if (reset.count) log(`xếp hàng lại ${reset.count} file đang xử lý dở`);
  if (drive.driveEnabled()) {
    const c = await drive.checkConnection();
    log(c.ok ? `Google Drive: đã kết nối thư mục "${c.name}"` : `Google Drive: LỖI kết nối - ${c.error}`);
  } else log("Google Drive: chưa cấu hình, file gốc giữ trên VPS");
  log(`sẵn sàng, xử lý song song ${CONCURRENCY} file`);
  setInterval(housekeeping, 10 * 60_000);
  void housekeeping();
  void runTelegramBot();
  runTelegramDigest();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => loop(i + 1)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
