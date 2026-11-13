// Lưu file trên ổ VPS (thư mục STORAGE_DIR). Dùng chung cho web và worker (không import "server-only").
import fs from "node:fs";
import path from "node:path";

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), "data", "storage"));

export const dirs = {
  uploads: path.join(STORAGE_DIR, "uploads"), // phần đang upload dở (.part)
  originals: path.join(STORAGE_DIR, "originals"), // file gốc (xoá sau khi lên Drive)
  media: path.join(STORAGE_DIR, "media"), // bản xem, thumbnail, sprite, waveform
  tmp: path.join(STORAGE_DIR, "tmp"),
};

export function ensureDirs() {
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
}

/** Đường dẫn tuyệt đối từ key tương đối, chặn thoát ra ngoài STORAGE_DIR. */
export function abs(key: string) {
  const p = path.resolve(STORAGE_DIR, key);
  if (!p.startsWith(STORAGE_DIR + path.sep)) throw new Error("Đường dẫn không hợp lệ");
  return p;
}

export function rel(p: string) {
  return path.relative(STORAGE_DIR, p).split(path.sep).join("/");
}

export function safeName(name: string) {
  return (
    name
      .normalize("NFC")
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "file"
  );
}

export function removeQuiet(p: string) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* bỏ qua */
  }
}

export function mediaDir(versionId: string) {
  return path.join(dirs.media, versionId);
}
