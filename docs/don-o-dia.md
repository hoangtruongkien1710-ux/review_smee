# Tự dọn bản xem trên ổ VPS

Mỗi video/audio upload lên có 2 bản:

- **File gốc**: đẩy lên Google Drive xong thì xoá khỏi VPS (không tốn ổ VPS).
- **Bản xem** (proxy mp4/m4a để phát trên web): nằm trên ổ VPS, chiếm nhiều dung lượng nhất.

Worker tự dọn bản xem mỗi 30 phút theo các quy tắc:

| Trường hợp | Khi nào dọn |
|---|---|
| Phiên bản cũ (không phải bản hiện tại, hoặc file đã vào thùng rác) | 14 ngày không ai mở |
| Bản hiện tại | 60 ngày không ai mở |
| Ổ đĩa còn dưới 10 GB trống | Dọn thêm, file lâu không mở nhất trước (phiên bản cũ trước), tới khi còn 12 GB. Không đụng file vừa mở trong 24 giờ |

Chỉ dọn file **đã có bản gốc trên Google Drive**. Thumbnail, ảnh tua nhanh và comment vẫn giữ nguyên.
Ảnh, PDF và tài liệu không bị dọn (dung lượng nhỏ).

## Khi mở lại file đã bị dọn

App tự tải file gốc từ Drive về, tạo lại bản xem (mất vài phút tuỳ độ dài video), rồi xoá bản gốc tạm.
Người xem thấy dòng "Đang tạo lại bản xem…", xong sẽ tự phát. Khách xem qua link chia sẻ cũng vậy.

## Chỉnh thông số

Thêm vào file `.env` trên VPS rồi chạy `docker compose up -d`:

```
PREVIEW_KEEP_OLD_VERSION_DAYS=14
PREVIEW_KEEP_DAYS=60
STORAGE_MIN_FREE_GB=10
# PREVIEW_CLEANUP=off   # tắt hẳn
```

Xem worker đã dọn gì: `docker compose logs worker | grep cleanup`
