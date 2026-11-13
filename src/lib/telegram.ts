// Gửi thông báo qua Telegram bot. Dùng chung cho web và worker (không import "server-only").
// Cấu hình: TELEGRAM_BOT_TOKEN (bắt buộc), TELEGRAM_GROUP_CHAT_ID (tuỳ chọn, nhóm nhận mọi comment).

const API = () => `${process.env.TELEGRAM_API || "https://api.telegram.org"}/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN?.trim();
export const groupChatId = () => process.env.TELEGRAM_GROUP_CHAT_ID?.trim() || "";

export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T> {
  const r = await fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
    parameters?: { migrate_to_chat_id?: number };
  };
  if (!j.ok) {
    const err = new Error(`Telegram ${method}: ${j.description ?? r.status}`) as Error & { migrateTo?: string };
    if (j.parameters?.migrate_to_chat_id) err.migrateTo = String(j.parameters.migrate_to_chat_id);
    throw err;
  }
  return j.result as T;
}

let username: string | null = null;
/** Username của bot (để tạo link t.me/<bot>?start=...). */
export async function botUsername() {
  if (!username) username = (await tg<{ username: string }>("getMe")).username;
  return username;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Gửi tin (HTML). Lỗi chỉ ghi log, không làm hỏng thao tác chính. */
export async function sendTelegram(chatId: string, html: string, button?: { text: string; url: string }) {
  if (!telegramEnabled() || !chatId) return;
  try {
    // Telegram chỉ nhận nút link https / http có tên miền thật, localhost thì bỏ nút, link vẫn nằm trong nội dung
    const okButton = button && /^https?:\/\/(?!localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(button.url);
    await tg("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(okButton ? { reply_markup: { inline_keyboard: [[{ text: button!.text, url: button!.url }]] } } : {}),
    });
  } catch (e) {
    console.error("[telegram]", (e as Error).message);
  }
}

export function appUrl(path: string) {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "") + path;
}

let groupResolved: string | null = null;
/** Chat id nhóm đang dùng thật (sau khi đã tự sửa -100 / nhóm nâng cấp). */
export const activeGroupId = () => groupResolved ?? groupChatId();

/**
 * Gửi tin vào nhóm chung. Báo lỗi (throw) để bên gọi biết mà thử lại sau.
 * Tự xử lý 2 trường hợp hay gặp: id copy từ web.telegram.org thiếu tiền tố -100 (supergroup),
 * và nhóm thường đã được Telegram nâng cấp thành supergroup (đổi id).
 */
export async function sendToGroup(html: string, button?: { text: string; url: string }) {
  const base = groupChatId();
  if (!telegramEnabled() || !base) return false;
  const okButton = button && /^https?:\/\/(?!localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(button.url);
  const send = (chat_id: string) =>
    tg("sendMessage", {
      chat_id,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(okButton ? { reply_markup: { inline_keyboard: [[{ text: button!.text, url: button!.url }]] } } : {}),
    });
  const first = activeGroupId();
  try {
    await send(first);
    return true;
  } catch (e) {
    const err = e as Error & { migrateTo?: string };
    let alt: string | null = null;
    if (err.migrateTo) alt = err.migrateTo;
    else if (/chat not found/i.test(err.message) && /^-\d+$/.test(first) && !first.startsWith("-100")) alt = `-100${first.slice(1)}`;
    if (!alt) throw e;
    await send(alt);
    groupResolved = alt;
    console.log(`[telegram] nhóm dùng chat id ${alt} (nên sửa TELEGRAM_GROUP_CHAT_ID=${alt} trong .env)`);
    return true;
  }
}
