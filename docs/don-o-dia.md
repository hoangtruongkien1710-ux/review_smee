# Bản xem và ổ đĩa VPS

Mỗi video/audio upload lên có 2 bản, **cả hai đều nằm trên Google Drive**:

- **File gốc**: trong thư mục project trên Drive.
- **Bản xem** (mp4 tối đa 2K / m4a để phát trên web): trong thư mục `_Bản xem (Smee Review)` ở thư mục gốc Drive.
  Khi có người xem, VPS lấy từng đoạn từ Drive và chuyển tiếp (hỗ trợ tua), không lưu lại.

VPS chỉ giữ thumbnail, ảnh tua nhanh, sóng âm và bản xem ảnh/PDF (nhỏ). File gốc và bản xem chỉ nằm tạm
trên VPS vài phút lúc xử lý, đẩy lên Drive xong là xoá. Bản xem cũ đang nằm trên VPS được worker đẩy dần lên
Drive (bản 4K được nén lại 2K trước). Tắt: `PREVIEW_ON_DRIVE=off`.

Xoá vĩnh viễn file/phiên bản/project trong app thì bản xem trên Drive vào thùng rác Drive.

## Dọn bản xem còn nằm trên VPS

Chỉ áp dụng cho bản xem **chưa** lên Drive (Drive lỗi, hoặc `PREVIEW_ON_DRIVE=off`).
Worker tự dọn mỗi 30 phút theo các quy tắc:

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
