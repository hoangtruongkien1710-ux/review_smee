// Nhận tin nhắn gửi tới bot (long polling): trả lời /id để lấy chat id của nhóm.
import { activeGroupId, esc, tg, telegramEnabled } from "../lib/telegram.ts";

type Update = {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string };
    from?: { first_name?: string; last_name?: string; username?: string };
  };
};

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[telegram]", ...a);
const reply = (chatId: number, text: string) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }).catch((e) => log((e as Error).message));

async function handle(u: Update) {
  const m = u.message;
  if (!m?.text) return;
  const text = m.text.trim();
  const chatId = m.chat.id;
  const cmd = text.split(/\s+/)[0].replace(/@\w+$/, "").toLowerCase();

  if (cmd === "/id") {
    const inGroup = m.chat.type !== "private";
    await reply(
      chatId,
      inGroup
        ? `Chat id của nhóm <b>${esc(m.chat.title ?? "")}</b> là:\n<code>${chatId}</code>\n\nDán vào file .env: <code>TELEGRAM_GROUP_CHAT_ID=${chatId}</code>` +
            (activeGroupId() === String(chatId) ? "\n\n✅ Nhóm này đang nhận bản tin comment." : "")
        : `Chat id của bạn là <code>${chatId}</code>.`,
    );
    return;
  }

  if (m.chat.type === "private") await reply(chatId, "Bot này gửi bản tin comment của Smee Review vào nhóm. Thêm bot vào nhóm rồi gõ /id để lấy chat id.");
}

/** Vòng lặp nhận tin. Chạy trong worker, chỉ một nơi gọi getUpdates. */
export async function runTelegramBot() {
  if (!telegramEnabled()) {
    log("chưa cấu hình TELEGRAM_BOT_TOKEN, bỏ qua");
    return;
  }
  try {
    const me = await tg<{ username: string }>("getMe");
    await tg("deleteWebhook", {}).catch(() => {});
    log(`bot @${me.username} đã sẵn sàng`);
  } catch (e) {
    log(`LỖI kết nối bot: ${(e as Error).message}`);
  }
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg<Update[]>("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] }, 65_000);
      for (const u of updates) {
        offset = u.update_id + 1;
        await handle(u).catch((e) => log("xử lý tin lỗi:", (e as Error).message));
      }
    } catch (e) {
      log("getUpdates lỗi, thử lại sau 10 giây:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}
