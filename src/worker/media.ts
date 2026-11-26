// Các bước xử lý file bằng FFmpeg / LibreOffice / Poppler.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export class ToolError extends Error {}

export function run(
  cmd: string,
  args: string[],
  opts: { onStdout?: (s: string) => void; timeoutMs?: number; collect?: boolean } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = opts.timeoutMs ? setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs) : null;
    p.stdout.on("data", (d: Buffer) => {
      const s = d.toString();
      if (opts.collect !== false) out += s;
      opts.onStdout?.(s);
    });
    p.stderr.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-10000);
    });
    p.on("error", (e) => reject(new ToolError(`Không chạy được ${cmd}: ${e.message}`)));
    p.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new ToolError(`${cmd} lỗi (mã ${code}): ${err.trim().split("\n").slice(-3).join(" | ")}`));
    });
  });
}

export type Probe = {
  duration: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  vcodec?: string;
  pixFmt?: string;
  acodec?: string;
  /** bit/giây của cả file */
  bitrate?: number | null;
};

export async function probe(file: string): Promise<Probe> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(stdout) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: { codec_type: string; codec_name?: string; pix_fmt?: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string; duration?: string; disposition?: { attached_pic?: number } }[];
  };
  const v = j.streams?.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const a = j.streams?.find((s) => s.codec_type === "audio");
  const rate = (r?: string) => {
    if (!r || r === "0/0") return null;
    const [n, d] = r.split("/").map(Number);
    return d ? n / d : n;
  };
  let fps = rate(v?.avg_frame_rate) ?? rate(v?.r_frame_rate);
  if (fps && (fps > 240 || fps < 1)) fps = rate(v?.r_frame_rate);
  const duration = Number(j.format?.duration ?? v?.duration ?? a?.duration);
  return {
    duration: Number.isFinite(duration) ? duration : null,
    fps: fps ? Math.round(fps * 1000) / 1000 : null,
    width: v?.width ?? null,
    height: v?.height ?? null,
    hasVideo: !!v,
    hasAudio: !!a,
    vcodec: v?.codec_name,
    pixFmt: v?.pix_fmt,
    acodec: a?.codec_name,
    bitrate: Number(j.format?.bit_rate) || null,
  };
}

/** File gốc phát thẳng được trên mọi trình duyệt: H.264 8-bit 4:2:0, tiếng AAC/MP3 (hoặc không có tiếng), đuôi mp4/m4v/mov. */
export function browserPlayable(p: Probe, ext: string) {
  return (
    p.hasVideo &&
    ["mp4", "m4v", "mov"].includes(ext) &&
    p.vcodec === "h264" &&
    ["yuv420p", "yuvj420p"].includes(p.pixFmt ?? "") &&
    (!p.hasAudio || ["aac", "mp3"].includes(p.acodec ?? ""))
  );
}

/** Dùng luôn file gốc làm bản xem (không nén lại): phát thẳng được, và không quá 2K hoặc nhẹ (dưới SKIP_PROXY_MAX_MBPS, mặc định 25 Mbps). */
export function canSkipProxy(p: Probe, ext: string, sizeBytes: number) {
  if (process.env.SKIP_PROXY === "off" || !browserPlayable(p, ext)) return false;
  const long = Math.max(p.width ?? 0, p.height ?? 0);
  const bps = p.bitrate ?? (p.duration ? (sizeBytes * 8) / p.duration : Infinity);
  const maxBps = (Number(process.env.SKIP_PROXY_MAX_MBPS) || 25) * 1e6;
  return long <= proxyMax() || bps <= maxBps;
}

/** Cạnh dài tối đa của bản xem video (PROXY_MAX_SIZE, mặc định 2560 = 2K). */
export const proxyMax = () => Math.max(480, Number(process.env.PROXY_MAX_SIZE) || 2560);

/** Bản xem video: H.264, cạnh dài tối đa PROXY_MAX_SIZE (mặc định 2560 = 2K), nén CRF PROXY_CRF (mặc định 19 = nét), AAC, faststart. */
export async function videoProxy(
  input: string,
  out: string,
  info: Probe,
  onProgress: (pct: number) => void,
  opts: { max?: number; crf?: number } = {},
) {
  const max = opts.max ?? proxyMax();
  const crf = String(Math.min(35, Math.max(14, opts.crf ?? (Number(process.env.PROXY_CRF) || 19))));
  const scale = `scale='if(gte(iw,ih),min(${max},iw),-2)':'if(gte(iw,ih),-2,min(${max},ih))':flags=lanczos,format=yuv420p`;
  const args = ["-y", "-hide_banner", "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-vf", scale,
    "-c:v", "libx264", "-preset", process.env.FFMPEG_PRESET || "superfast", "-crf", crf, "-profile:v", "high",
    "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-movflags", "+faststart",
    "-threads", String(process.env.FFMPEG_THREADS || 0), "-progress", "pipe:1", "-nostats", out];
  await run("ffmpeg", args, {
    collect: false,
    onStdout: (s) => {
      const m = /out_time_us=(\d+)/.exec(s);
      if (m && info.duration) onProgress(Math.min(99, (Number(m[1]) / 1e6 / info.duration) * 100));
    },
  });
}

export async function frameAt(input: string, sec: number, out: string, width = 640) {
  const seek = sec > 0 ? ["-ss", String(sec)] : [];
  await run("ffmpeg", ["-y", "-hide_banner", ...seek, "-i", input, "-frames:v", "1", "-vf", `scale='min(${width},iw)':-2`, "-q:v", "3", out]);
  if (!fs.existsSync(out)) throw new ToolError("Không tạo được ảnh thumbnail");
}

/** Ảnh scrub: 100 khung hình nhỏ ghép thành lưới 10x10, rê chuột trên thẻ để xem nhanh. */
export async function sprite(input: string, duration: number, out: string) {
  const n = 100;
  const interval = Math.max(duration / n, 0.04);
  await run("ffmpeg", ["-y", "-hide_banner", "-i", input, "-vf", `fps=1/${interval},scale=160:-2,tile=10x10`, "-frames:v", "1", "-q:v", "5", out]);
  return { cols: 10, count: Math.min(n, Math.max(1, Math.floor(duration / interval))) };
}

export async function audioProxy(input: string, out: string) {
  await run("ffmpeg", ["-y", "-hide_banner", "-i", input, "-vn", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
}

/** Sóng âm: 1000 điểm (giá trị 0..1). */
export async function waveform(input: string, out: string, points = 1000) {
  const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", input, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"]);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    p.stdout.on("data", (d: Buffer) => chunks.push(d));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new ToolError("Không tạo được sóng âm"))));
  });
  const buf = Buffer.concat(chunks);
  const samples = Math.floor(buf.length / 2);
  const per = Math.max(1, Math.floor(samples / points));
  const peaks: number[] = [];
  for (let i = 0; i < points && i * per < samples; i++) {
    let max = 0;
    for (let j = i * per; j < Math.min(samples, (i + 1) * per); j++) max = Math.max(max, Math.abs(buf.readInt16LE(j * 2)));
    peaks.push(Math.round((max / 32768) * 1000) / 1000);
  }
  fs.writeFileSync(out, JSON.stringify(peaks));
}

/** Ảnh xem trước tối đa 4096px. Thử FFmpeg trước, không được thì ImageMagick (PSD, HEIC…). */
export async function imagePreview(input: string, out: string) {
  try {
    await run("ffmpeg", ["-y", "-hide_banner", "-i", input, "-frames:v", "1", "-vf", "scale='min(4096,iw)':-2", "-q:v", "2", out]);
  } catch {
    await run("convert", [`${input}[0]`, "-auto-orient", "-resize", "4096x4096>", "-quality", "92", out]);
  }
}

export async function pdfInfo(file: string) {
  try {
    const { stdout } = await run("pdfinfo", [file]);
    const m = /Pages:\s+(\d+)/.exec(stdout);
    return { pages: m ? Number(m[1]) : null };
  } catch {
    return { pages: null };
  }
}

export async function pdfThumb(file: string, outJpg: string) {
  const base = outJpg.replace(/\.jpg$/, "");
  await run("pdftoppm", ["-jpeg", "-f", "1", "-l", "1", "-scale-to", "640", "-singlefile", file, base]);
}

/** Mỗi trang PDF thành 1 ảnh JPG (cạnh dài 1600px) để xem + ghim comment theo trang. */
export async function pdfPages(file: string, outDir: string, pages: number, onProgress?: (pct: number) => void) {
  fs.mkdirSync(outDir, { recursive: true });
  const step = 20;
  for (let f = 1; f <= pages; f += step) {
    const l = Math.min(pages, f + step - 1);
    await run("pdftoppm", ["-jpeg", "-jpegopt", "quality=85", "-f", String(f), "-l", String(l), "-scale-to", "1600", file, path.join(outDir, "p")], {
      timeoutMs: 10 * 60_000,
    });
    onProgress?.(l / pages);
  }
  // pdftoppm đặt tên p-1.jpg / p-01.jpg / p-001.jpg tuỳ số trang → chuẩn hoá về <số>.jpg
  for (const name of fs.readdirSync(outDir)) {
    const m = /^p-0*(\d+)\.jpg$/.exec(name);
    if (m) fs.renameSync(path.join(outDir, name), path.join(outDir, `${Number(m[1])}.jpg`));
  }
  if (!fs.existsSync(path.join(outDir, "1.jpg"))) throw new ToolError("Không tạo được ảnh trang PDF");
}

/** Word/Excel/PowerPoint → PDF bằng LibreOffice. */
export async function officeToPdf(input: string, outPdf: string, workDir: string) {
  const profile = path.join(workDir, "lo-profile");
  await run(
    "soffice",
    [`-env:UserInstallation=file://${profile}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", workDir, input],
    { timeoutMs: 10 * 60_000 },
  );
  const produced = path.join(workDir, path.basename(input).replace(/\.[^.]+$/, "") + ".pdf");
  if (!fs.existsSync(produced)) throw new ToolError("LibreOffice không tạo được PDF");
  fs.renameSync(produced, outPdf);
}
