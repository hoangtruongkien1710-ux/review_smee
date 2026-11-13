export const COLORS = ["#FF6B4A", "#F5A524", "#17C964", "#06B6D4", "#7C83FD", "#E85D9E", "#A3E635", "#F97316"];

export function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function timeAgo(d: Date | string | number) {
  const t = new Date(d).getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "vừa xong";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const day = Math.round(h / 24);
  if (day < 30) return `${day} ngày trước`;
  return new Date(d).toLocaleDateString("vi-VN");
}

export function formatDate(d: Date | string | number) {
  return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Tên đăng nhập: chữ thường không dấu, số, . _ - (có thể là email). */
export const LOGIN_RE = /^[a-z0-9][a-z0-9._@+-]{1,79}$/;
export const LOGIN_MSG = "Tên đăng nhập 2–80 ký tự: chữ thường không dấu, số, dấu chấm, gạch ngang (có thể dùng email)";
