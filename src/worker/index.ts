// Worker xử lý file sau khi upload: tạo bản xem, thumbnail, ảnh scrub, sóng âm, PDF xem trước,
// rồi đẩy file gốc lên Google Drive. Chạy: npm run worker
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma-core.ts";
import { abs, dirs, ensureDirs, mediaDir, rel, removeQuiet, safeName } from "../lib/storage.ts";
import { extOf } from "../lib/kinds.ts";
import * as drive from "../lib/drive.ts";
import { assetParent, driveFileName } from "../lib/drive-sync.ts";
import * as m from "./media.ts";
import { SHEET_EXTS, readSheets } from "./sheet.ts";
import { runTelegramBot } from "./telegram-bot.ts";
import { runTelegramDigest } from "./telegram-digest.ts";
import { cleanupConfig, freeBytes, runPreviewCleanup } from "./preview-cleanup.ts";

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

/** Tải file gốc từ Google Drive về VPS (để tạo lại bản xem đã bị dọn). */
async function fetchOriginal(v: { id: string; driveFileId: string; originalName: string; size: bigint }) {
  if (!drive.driveEnabled()) throw new Error("Chưa kết nối Google Drive để lấy lại file gốc");
  const need = Number(v.size) + cleanupConfig().minFreeGb * 0.5 * 1024 ** 3;
  if (freeBytes() < need) throw new Error("Ổ đĩa VPS không đủ chỗ để tạo lại bản xem, hãy dọn bớt ổ đĩa");
  const dir = path.join(dirs.originals, v.id);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, safeName(v.originalName));
  const r = await drive.download(v.driveFileId);
  if (!r.ok || !r.body) throw new Error(`Không tải được file gốc từ Google Drive (${r.status})`);
  const tmp = dest + ".part";
  const { pipeline } = await import("node:stream/promises");
  const { Readable } = await import("node:stream");
  try {
    await pipeline(Readable.fromWeb(r.body as import("node:stream/web").ReadableStream), fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
  } catch (e) {
    removeQuiet(dir);
    throw e;
  }
  log(`đã tải lại file gốc từ Drive: ${v.originalName}`);
  return dest;
}

async function processVersion(id: string) {
  const v = await prisma.version.findUniqueOrThrow({ where: { id }, include: { asset: true } });
  let input = v.originalKey ? abs(v.originalKey) : null;
  let fromDrive = false;
  if (!input || !fs.existsSync(input)) {
    if (!v.driveFileId) throw new Error(v.originalKey ? "Không tìm thấy file gốc trên máy chủ" : "Không còn file gốc trên máy chủ");
    input = await fetchOriginal({ ...v, driveFileId: v.driveFileId });
    fromDrive = true;
  }
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
        if (SHEET_EXTS.includes(ext)) {
          // bảng tính: thêm dữ liệu dạng bảng để xem như Excel (không lỗi cả file nếu đọc hỏng)
          try {
            const sheet = await readSheets(input, ext, work);
            const p = path.join(out, "sheet.json");
            fs.writeFileSync(p, JSON.stringify(sheet));
            data.sheetKey = rel(p);
          } catch (e) {
            data.sheetKey = "";
            log(`không đọc được bảng tính: ${(e as Error).message}`);
          }
        }
        break;
      }
      default:
        // File khác: không có trình xem, chỉ lưu và cho tải về
        break;
    }
  } catch (e) {
    if (fromDrive) removeQuiet(path.dirname(input));
    throw e;
  } finally {
    removeQuiet(work);
  }
  const restored = v.previewPurgedAt ? { previewPurgedAt: null, lastViewedAt: new Date() } : {};
  // xử lý lại file đã có bản xem trên Drive: bản mới nằm trên VPS, bản cũ trên Drive bỏ đi
  const oldProxy = v.proxyDriveId && data.proxyKey ? v.proxyDriveId : null;
  await prisma.version.update({
    where: { id },
    data: { ...data, ...restored, ...(oldProxy ? { proxyDriveId: null } : {}), processingStatus: "READY", progress: 100 },
  });
  if (oldProxy) void drive.remove(oldProxy).catch(() => {});
  log(`xong ${v.kind} ${v.originalName}${v.previewPurgedAt ? " (tạo lại bản xem)" : ""}`);
  if (fromDrive) {
    // file gốc đã có trên Drive: bản vừa tải về chỉ dùng tạm
    if (KEEP_ORIGINALS) await prisma.version.update({ where: { id }, data: { originalKey: rel(input) } });
    else removeQuiet(path.dirname(input));
  } else await pushToDrive(id);
  await pushProxy(id);
}

/* ---------- bản xem video/audio trên Google Drive ---------- */

const PROXY_FOLDER_NAME = "_Bản xem (Smee Review)";
const PROXY_KINDS = ["VIDEO", "AUDIO"];
const proxyOnDrive = () => drive.driveEnabled() && process.env.PREVIEW_ON_DRIVE !== "off";
const proxyBusy = new Set<string>();
let proxyFolderId: string | null = null;

/** Thư mục chứa bản xem trên Drive (nằm trong thư mục gốc, cạnh các thư mục project). */
async function proxyFolder() {
  if (proxyFolderId) return proxyFolderId;
  const key = "drive_proxy_folder";
  const s = await prisma.setting.findUnique({ where: { key } });
  if (s && typeof s.value === "string") return (proxyFolderId = s.value);
  const id = await drive.ensureFolder(PROXY_FOLDER_NAME, drive.driveRoot());
  await prisma.setting.upsert({ where: { key }, create: { key, value: id }, update: { value: id } });
  return (proxyFolderId = id);
}

/** Đẩy bản xem video/audio lên Drive rồi xoá bản trên VPS. Bản xem cũ lớn hơn 2K được nén lại trước. */
async function pushProxy(id: string) {
  if (!proxyOnDrive() || proxyBusy.has(id)) return;
  proxyBusy.add(id);
  let tmp: string | null = null;
  try {
    const v = await prisma.version.findUnique({ where: { id } });
    if (!v?.proxyKey || v.proxyDriveId || v.processingStatus !== "READY" || !PROXY_KINDS.includes(v.kind)) return;
    const file = abs(v.proxyKey);
    if (!fs.existsSync(file)) return;
    let upload = file;
    if (v.kind === "VIDEO") {
      const info = await m.probe(file);
      if (Math.max(info.width ?? 0, info.height ?? 0) > m.proxyMax()) {
        tmp = path.join(dirs.tmp, `${id}-proxy.mp4`);
        await m.videoProxy(file, tmp, info, () => {});
        upload = tmp;
      }
    }
    const ext = extOf(v.proxyKey) || "mp4";
    const base = v.originalName.replace(/\.[^.]+$/, "");
    const fileId = await drive.uploadFile(upload, `${base}_${id}.${ext}`, ext === "m4a" ? "audio/mp4" : "video/mp4", await proxyFolder());
    // trong lúc đẩy mà file bị xử lý lại / xoá → bỏ bản vừa đẩy
    const n = await prisma.version.updateMany({ where: { id, proxyKey: v.proxyKey, proxyDriveId: null }, data: { proxyDriveId: fileId } });
    if (!n.count) {
      await drive.remove(fileId).catch(() => {});
      return;
    }
    removeQuiet(file);
    log(`đã đẩy bản xem lên Drive: ${v.originalName}${tmp ? " (nén lại 2K)" : ""}`);
  } catch (e) {
    const msg = (e as Error).message;
    // thư mục bản xem bị xoá trên Drive → lần sau tạo lại
    if (/404|notFound/i.test(msg)) {
      proxyFolderId = null;
      await prisma.setting.delete({ where: { key: "drive_proxy_folder" } }).catch(() => {});
    }
    log(`đẩy bản xem lên Drive lỗi (sẽ thử lại sau): ${msg}`);
  } finally {
    if (tmp) removeQuiet(tmp);
    proxyBusy.delete(id);
  }
}

/** Bản xem còn trên VPS (file cũ, hoặc lần đẩy trước lỗi) → đẩy dần lên Drive, mỗi lượt tối đa 20 file. */
let proxyBackfillRunning = false;
async function backfillProxies() {
  if (!proxyOnDrive() || proxyBackfillRunning) return;
  proxyBackfillRunning = true;
  try {
    const rows = await prisma.version.findMany({
      where: { kind: { in: ["VIDEO", "AUDIO"] }, processingStatus: "READY", proxyKey: { not: null }, proxyDriveId: null },
      select: { id: true, proxyKey: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    for (const r of rows) if (r.proxyKey && fs.existsSync(abs(r.proxyKey))) await pushProxy(r.id);
  } catch (e) {
    log("đẩy dần bản xem lỗi:", (e as Error).message);
  } finally {
    proxyBackfillRunning = false;
  }
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
      if (id) {
        // file đã từng xem được (tạo lại bản xem / xử lý lại bảng tính) mà lỗi: giữ nguyên trạng thái xem được
        const prev = await prisma.version
          .findUnique({ where: { id }, select: { previewPurgedAt: true, proxyKey: true, sheetKey: true } })
          .catch(() => null);
        const keep = !!(prev?.previewPurgedAt || prev?.proxyKey);
        await prisma.version
          .update({
            where: { id },
            data: {
              processingStatus: keep ? "READY" : "FAILED",
              processingError: msg.slice(0, 1000),
              ...(keep && prev?.sheetKey == null ? { sheetKey: "" } : {}),
            },
          })
          .catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** Bảng tính upload trước khi có trình xem dạng bảng → xử lý lại (mỗi lượt vài file). */
async function backfillSheets() {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Version"
    WHERE kind = 'DOCUMENT' AND "processingStatus" = 'READY' AND "sheetKey" IS NULL
      AND ("originalKey" IS NOT NULL OR "driveFileId" IS NOT NULL)
      AND lower(substring("originalName" from '\.([^.]+)$')) = ANY(${SHEET_EXTS})
    LIMIT 3`;
  for (const r of rows)
    await prisma.version.updateMany({ where: { id: r.id, processingStatus: "READY" }, data: { processingStatus: "QUEUED", progress: 0 } });
  if (rows.length) log(`xử lý lại ${rows.length} bảng tính để xem dạng bảng`);
}

/** Định kỳ: thử đẩy lại các file chưa lên Drive, dọn phiên upload bỏ dở quá 3 ngày. */
async function housekeeping() {
  try {
    await backfillSheets();
    void backfillProxies();
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
  runPreviewCleanup();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => loop(i + 1)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
