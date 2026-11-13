// Bản tin comment cho nhóm Telegram chung.
// Không gửi từng comment: gom lại, chỉ gửi khi mọi người đã ngừng comment một lúc
// (TELEGRAM_DIGEST_QUIET_MIN, mặc định 10 phút), hoặc khi comment đầu tiên đã chờ quá
// TELEGRAM_DIGEST_MAX_MIN (mặc định 60 phút). Mỗi file chỉ một dòng: dự án, tên file, số comment, ai comment.
import { prisma } from "../lib/prisma-core.ts";
import { appUrl, esc, groupChatId, sendToGroup, telegramEnabled } from "../lib/telegram.ts";

const KEY = "telegram_digest_cursor";
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[telegram-digest]", ...a);
const minutes = (name: string, def: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name]?.trim() ? n : def;
};

async function getCursor(): Promise<Date | null> {
  const s = await prisma.setting.findUnique({ where: { key: KEY } });
  const v = s?.value as { at?: string } | null;
  return v?.at ? new Date(v.at) : null;
}
const setCursor = (d: Date) =>
  prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: { at: d.toISOString() } }, update: { value: { at: d.toISOString() } } });

let busy = false;
export async function digestTick(now = new Date()) {
  if (busy || !telegramEnabled() || !groupChatId()) return;
  busy = true;
  try {
    const cursor = await getCursor();
    if (!cursor) {
      // lần đầu bật: không gửi lại comment cũ
      await setCursor(now);
      return;
    }
    // chỉ lấy tới thời điểm này, comment đến sau sẽ vào bản tin sau
    const upto = new Date();
    const rows = await prisma.comment.findMany({
      where: { createdAt: { gt: cursor, lte: upto } },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        guestName: true,
        author: { select: { name: true } },
        asset: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
      },
    });
    const approvals = await prisma.approval.findMany({
      where: { createdAt: { gt: cursor, lte: upto } },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        decision: true,
        guestName: true,
        user: { select: { name: true } },
        version: { select: { versionNo: true } },
        asset: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
      },
    });
    if (!rows.length && !approvals.length) return;
    const times = [...rows, ...approvals].map((r) => r.createdAt.getTime());
    const oldest = Math.min(...times);
    const newest = Math.max(...times);
    const quiet = minutes("TELEGRAM_DIGEST_QUIET_MIN", 10) * 60_000;
    const max = minutes("TELEGRAM_DIGEST_MAX_MIN", 60) * 60_000;
    if (now.getTime() - newest < quiet && now.getTime() - oldest < max) return;

    // gom theo dự án → file
    type F = { id: string; name: string; n: number; who: Set<string>; decisions: string[] };
    const projects = new Map<string, { name: string; files: Map<string, F> }>();
    const fileOf = (asset: { id: string; name: string; project: { id: string; name: string } }) => {
      const p = asset.project;
      if (!projects.has(p.id)) projects.set(p.id, { name: p.name, files: new Map() });
      const files = projects.get(p.id)!.files;
      if (!files.has(asset.id)) files.set(asset.id, { id: asset.id, name: asset.name, n: 0, who: new Set(), decisions: [] });
      return files.get(asset.id)!;
    };
    for (const r of rows) {
      const f = fileOf(r.asset);
      f.n++;
      f.who.add(r.author?.name ?? `${r.guestName ?? "Khách"} (khách)`);
    }
    for (const a of approvals) {
      const who = a.user?.name ?? `${a.guestName ?? "Khách"} (khách)`;
      fileOf(a.asset).decisions.push(`${a.decision === "APPROVED" ? "✅ Duyệt" : "❌ Cần sửa"} V${a.version.versionNo} (${who})`);
    }

    const head = [rows.length && `${rows.length} comment mới`, approvals.length && `${approvals.length} lượt duyệt`].filter(Boolean).join(", ");
    const lines: string[] = [`🔔 <b>${head.charAt(0).toUpperCase() + head.slice(1)}</b>`];
    for (const [pid, p] of projects) {
      lines.push("", `📁 <b>${esc(p.name)}</b>`);
      for (const f of p.files.values()) {
        const url = appUrl(`/projects/${pid}/assets/${f.id}`);
        const parts = [f.n ? `${f.n} comment (${[...f.who].join(", ")})` : "", ...f.decisions].filter(Boolean);
        lines.push(`• <a href="${esc(url)}">${esc(f.name)}</a>: ${esc(parts.join(" · "))}`);
      }
    }
    let html = lines.join("\n");
    if (html.length > 3900) html = html.slice(0, 3900) + "\n…";
    await sendToGroup(html);
    await setCursor(new Date(newest));
    log(`đã gửi bản tin ${rows.length} comment, ${approvals.length} lượt duyệt`);
  } catch (e) {
    log("lỗi, sẽ thử lại:", (e as Error).message);
  } finally {
    busy = false;
  }
}

export function runTelegramDigest() {
  if (!telegramEnabled() || !groupChatId()) return;
  log(
    `bật: gửi sau ${minutes("TELEGRAM_DIGEST_QUIET_MIN", 10)} phút không có comment mới, chậm nhất ${minutes("TELEGRAM_DIGEST_MAX_MIN", 60)} phút`,
  );
  setInterval(() => void digestTick(), 60_000);
  void digestTick();
}
