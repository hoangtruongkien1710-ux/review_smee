import "server-only";
// Xuất comment của một phiên bản: Excel, marker Premiere (FCP XML), marker DaVinci Resolve (EDL).
import type { SessionUser } from "./auth";
import { listComments } from "./comments";
import { plainText, type CommentDTO } from "./comment-dto";
import { DEFAULT_FPS, formatTime } from "./timecode";
import { buildXlsx } from "./xlsx";

type V = { id: string; assetId: string; versionNo: number; fps: number | null; durationSec: number | null; originalName: string };

const who = (c: CommentDTO) => c.author?.name ?? (c.guestName ? `${c.guestName} (khách)` : "Khách");

/** Comment theo đúng thứ tự & số thứ tự như trên màn hình duyệt. */
export async function orderedComments(viewer: Pick<SessionUser, "role">, v: V) {
  const list = await listComments(viewer, v.assetId, v.id);
  const key = (c: CommentDTO) => c.timeStart ?? (c.page != null ? c.page : Number.MAX_VALUE);
  return list.sort((a, b) => key(a) - key(b) || a.createdAt.localeCompare(b.createdAt));
}

const fpsOf = (v: V) => (v.fps && v.fps > 0 ? v.fps : DEFAULT_FPS);

export function toXlsx(v: V, assetName: string, comments: CommentDTO[]) {
  const fps = fpsOf(v);
  const header = ["#", "Timecode vào", "Timecode ra", "Trang", "Người viết", "Nội dung", "Trả lời", "Trạng thái", "Nội bộ", "Thời gian", "Ghi chú"];
  const rows = comments.map((c, i) => [
    i + 1,
    c.timeStart != null ? formatTime(c.timeStart, fps) : "",
    c.timeEnd != null ? formatTime(c.timeEnd, fps) : "",
    c.page ?? "",
    who(c),
    plainText(c.body),
    c.replies.map((r) => `${who(r)}: ${plainText(r.body)}`).join("\n"),
    c.resolved ? "Đã xong" : "Chưa xong",
    c.internal ? "Nội bộ" : "",
    new Date(c.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    c.fromVersionNo ? `Từ V${c.fromVersionNo}` : "",
  ]);
  return buildXlsx(`${assetName} V${v.versionNo}`, [header, ...rows], [5, 13, 13, 7, 20, 60, 50, 11, 8, 18, 10]);
}

/* ---------- Premiere: FCP 7 XML (File → Import) → sequence mới có sẵn marker ---------- */

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function rateOf(fps: number) {
  const base = Math.round(fps);
  const ntsc = Math.abs(fps - base) > 0.01;
  return { base, ntsc };
}

export function toPremiereXml(v: V, assetName: string, comments: CommentDTO[]) {
  const fps = fpsOf(v);
  const { base, ntsc } = rateOf(fps);
  const rate = `<rate><timebase>${base}</timebase><ntsc>${ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
  const frame = (t: number) => Math.round(t * fps);
  const duration = Math.max(1, frame(v.durationSec ?? 0));
  const markers = comments
    .filter((c) => c.timeStart != null)
    .map((c, i) => {
      const text = plainText(c.body).replace(/\s+/g, " ").trim();
      return `    <marker>
      <name>${xml(`#${i + 1} ${who(c)}`)}</name>
      <comment>${xml(text)}</comment>
      <in>${frame(c.timeStart!)}</in>
      <out>${c.timeEnd != null ? frame(c.timeEnd) : -1}</out>
    </marker>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${xml(`${assetName} V${v.versionNo} - comment`)}</name>
    <duration>${duration}</duration>
    ${rate}
    <timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
    <media>
      <video><format><samplecharacteristics>${rate}</samplecharacteristics></format><track/></video>
      <audio><track/></audio>
    </media>
${markers}
  </sequence>
</xmeml>
`;
}

/* ---------- DaVinci Resolve: EDL marker (Timeline → Import → Timeline Markers from EDL) ---------- */

export function toResolveEdl(v: V, assetName: string, comments: CommentDTO[], startHour = 1) {
  const fps = fpsOf(v);
  const { base } = rateOf(fps);
  const tc = (frames: number) => {
    const total = frames + startHour * 3600 * base;
    const ff = total % base;
    const s = Math.floor(total / base);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`;
  };
  const lines = [`TITLE: ${assetName.replace(/[\r\n]/g, " ")} V${v.versionNo}`, "FCM: NON-DROP FRAME", ""];
  comments
    .filter((c) => c.timeStart != null)
    .forEach((c, i) => {
      const a = Math.round(c.timeStart! * fps);
      const dur = c.timeEnd != null ? Math.max(1, Math.round(c.timeEnd * fps) - a) : 1;
      const n = String(i + 1).padStart(3, "0");
      const text = `#${i + 1} ${who(c)}: ${plainText(c.body)}`.replace(/[\r\n|]+/g, " ").slice(0, 240);
      const color = c.resolved ? "ResolveColorGreen" : c.internal ? "ResolveColorYellow" : "ResolveColorRed";
      lines.push(`${n}  001      V     C        ${tc(a)} ${tc(a + 1)} ${tc(a)} ${tc(a + 1)}  `);
      lines.push(` |C:${color} |M:${text} |D:${dur}`);
      lines.push("");
    });
  return lines.join("\r\n");
}
