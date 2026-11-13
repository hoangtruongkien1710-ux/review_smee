# Thông báo Telegram

Smee Review gửi **bản tin comment** vào một nhóm Telegram của công ty. Nhân viên tự tham gia nhóm đó, app không cần biết tài khoản Telegram của từng người.

Bản tin không gửi theo từng comment mà gộp lại. Mỗi file một dòng: dự án, tên file (bấm để mở), số comment mới và ai comment.

## 1. Tạo bot (quản trị làm một lần)

1. Mở Telegram, tìm **@BotFather**, gửi `/newbot`, đặt tên và username (kết thúc bằng `bot`).
2. BotFather gửi lại **token** dạng `123456789:AA...`. Token là mật khẩu của bot: **không gửi cho ai, không đưa lên Git**.
3. Thêm vào file `.env` (cùng thư mục với `docker-compose.yml`):

   ```
   TELEGRAM_BOT_TOKEN=123456789:AA...
   ```

## 2. Gắn nhóm

1. Thêm bot vào nhóm Telegram của công ty.
2. Trong nhóm gõ `/id`. Bot trả lời dạng `TELEGRAM_GROUP_CHAT_ID=-...`. Thêm dòng đó vào `.env`.
3. Chạy `docker compose up -d` (phải là `up -d`, `restart` không nạp biến mới).
4. Gõ `/id` lần nữa: bot báo "✅ Nhóm này đang nhận bản tin comment".

Comment **nội bộ** cũng được tính vào bản tin, nên chỉ để nhân viên công ty trong nhóm, đừng thêm khách hàng.

## Khi nào nhóm nhận bản tin

Bản tin chỉ gửi khi mọi người **đã ngừng comment 10 phút** (một buổi review 30 comment → 1 tin). Nếu comment liên tục không nghỉ, cứ **tối đa 60 phút** gửi một lần. Đổi trong `.env` nếu muốn:

```
TELEGRAM_DIGEST_QUIET_MIN=10
TELEGRAM_DIGEST_MAX_MIN=60
```

## Link trong tin nhắn

Link trỏ tới địa chỉ trong `APP_URL`. Khi chưa có tên miền thì là `http://localhost:3000` (chỉ mở được trên máy chạy app). Khi đưa lên VPS và có tên miền, đặt `APP_URL=https://review.smee.vn` thì link bấm được từ điện thoại.
