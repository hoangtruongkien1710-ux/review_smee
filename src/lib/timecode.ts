// Định dạng thời gian cho trình phát: timecode HH:MM:SS:FF, số khung hình, hoặc giây.
export type TcMode = "tc" | "frames" | "sec";

export const DEFAULT_FPS = 25;

const pad = (n: number, l = 2) => String(Math.max(0, Math.floor(n))).padStart(l, "0");

/** Số khung hình tại thời điểm t (bắt đầu từ 0). */
export function frameOf(t: number, fps: number) {
  return Math.floor(t * fps + 1e-4);
}

export function formatTime(t: number | null | undefined, fps: number, mode: TcMode = "tc") {
  if (t == null || !Number.isFinite(t)) t = 0;
  t = Math.max(0, t);
  if (mode === "frames") return String(frameOf(t, fps));
  if (mode === "sec") {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${pad(m)}:${s.toFixed(2).padStart(5, "0")}`;
  }
  const fr = Math.round(fps);
  const total = frameOf(t, fps);
  const ff = total % fr;
  const secs = Math.floor(total / fr);
  return `${pad(secs / 3600)}:${pad((secs % 3600) / 60)}:${pad(secs % 60)}:${pad(ff)}`;
}

/** Nhãn thời gian cho danh sách comment. */
export function shortTime(t: number, fps: number, duration: number | null, mode: TcMode = "tc") {
  // Giữ đủ HH:MM:SS:FF để không nhầm phút:giây thành giờ:phút
  void duration;
  return formatTime(t, fps, mode);
}

export const TC_LABEL: Record<TcMode, string> = { tc: "Timecode", frames: "Khung hình", sec: "Giây" };
