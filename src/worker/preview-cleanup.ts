// Tự dọn bản xem (proxy video/audio) cũ trên ổ VPS để tiết kiệm dung lượng.
// Chỉ dọn bản xem của file đã có bản gốc trên Google Drive; thumbnail và ảnh scrub được giữ lại.
// Khi có người mở lại, app tự tải file gốc từ Drive về và tạo lại bản xem.
import fs from "node:fs";
import { prisma } from "../lib/prisma-core.ts";
import { STORAGE_DIR, abs, removeQuiet } from "../lib/storage.ts";

const num = (v: string | undefined, d: number) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const DAY = 86400_000;
const GB = 1024 ** 3;

export const cleanupConfig = () => ({
  enabled: process.env.PREVIEW_CLEANUP !== "off",
  /** Phiên bản cũ (không phải bản hiện tại): dọn sau N ngày không ai mở. */
  oldDays: num(process.env.PREVIEW_KEEP_OLD_VERSION_DAYS, 14),
  /** Bản hiện tại: dọn sau N ngày không ai mở. */
  keepDays: num(process.env.PREVIEW_KEEP_DAYS, 60),
  /** Ổ đĩa còn trống dưới mức này (GB) thì dọn thêm, từ file lâu không mở nhất. */
  minFreeGb: num(process.env.STORAGE_MIN_FREE_GB, 10),
});

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[cleanup]", ...a);

/** Dung lượng còn trống của ổ chứa STORAGE_DIR (byte). */
export function freeBytes(dir = STORAGE_DIR) {
  const s = fs.statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}

type Row = { id: string; proxyKey: string; current: boolean; seen: Date; originalName: string };

async function candidates(): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    SELECT v.id, v."proxyKey", v."originalName",
           (a."currentVersionId" = v.id AND a."deletedAt" IS NULL) AS current,
           COALESCE(v."lastViewedAt", v."createdAt") AS seen
    FROM "Version" v JOIN "Asset" a ON a.id = v."assetId"
    WHERE v.kind IN ('VIDEO', 'AUDIO')
      AND v."processingStatus" = 'READY'
      AND v."proxyKey" IS NOT NULL
      AND v."driveFileId" IS NOT NULL
      AND v."previewPurgedAt" IS NULL
      AND v."proxyDriveId" IS NULL
    ORDER BY current ASC, seen ASC`;
}

function sizeOf(key: string) {
  try {
    return fs.statSync(abs(key)).size;
  } catch {
    return 0;
  }
}

async function purge(r: Row) {
  const n = await prisma.version.updateMany({
    where: { id: r.id, proxyKey: r.proxyKey, processingStatus: "READY", previewPurgedAt: null },
    data: { proxyKey: null, previewPurgedAt: new Date() },
  });
  if (!n.count) return 0;
  const size = sizeOf(r.proxyKey);
  removeQuiet(abs(r.proxyKey));
  return size;
}

/** Chạy một lượt dọn. Trả về số bản xem đã dọn và dung lượng giải phóng. */
export async function cleanupPreviews(now = Date.now()) {
  const cfg = cleanupConfig();
  if (!cfg.enabled) return { count: 0, bytes: 0 };
  const rows = await candidates();
  let count = 0;
  let bytes = 0;
  const done = new Set<string>();

  // 1) Theo thời gian không ai mở
  for (const r of rows) {
    const idle = now - new Date(r.seen).getTime();
    if (idle > (r.current ? cfg.keepDays : cfg.oldDays) * DAY) {
      bytes += await purge(r);
      count++;
      done.add(r.id);
    }
  }

  // 2) Ổ đĩa sắp đầy: dọn tiếp từ file lâu không mở nhất (bản cũ trước), chừa file vừa mở trong 24 giờ
  const target = (cfg.minFreeGb + 2) * GB;
  if (freeBytes() < cfg.minFreeGb * GB) {
    for (const r of rows) {
      if (freeBytes() >= target) break;
      if (done.has(r.id) || now - new Date(r.seen).getTime() < DAY) continue;
      bytes += await purge(r);
      count++;
    }
    const left = freeBytes();
    if (left < cfg.minFreeGb * GB) log(`CẢNH BÁO: ổ đĩa chỉ còn ${(left / GB).toFixed(1)} GB trống dù đã dọn hết bản xem có thể dọn`);
  }

  if (count) log(`đã dọn ${count} bản xem, giải phóng ${(bytes / GB).toFixed(2)} GB`);
  return { count, bytes };
}

export function runPreviewCleanup() {
  const tick = () => cleanupPreviews().catch((e) => log("lỗi:", (e as Error).message));
  setInterval(tick, 30 * 60_000);
  setTimeout(tick, 60_000);
}
