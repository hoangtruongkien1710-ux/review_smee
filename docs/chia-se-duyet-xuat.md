# Chia sẻ cho khách, duyệt phiên bản, xuất comment

## Link chia sẻ cho khách

- Mở một file → nút **Chia sẻ** (biểu tượng chia sẻ trên thanh trên cùng), hoặc ở danh sách file: chọn nhiều file → **Chia sẻ**.
- Tuỳ chọn: mật khẩu, hạn dùng (7 / 30 / 90 ngày), cho comment, cho duyệt, cho tải file gốc (mặc định tắt).
- Khách mở link là xem và comment được, không cần tài khoản. Lần đầu comment, khách nhập tên của mình.
- Khách **chỉ thấy bản hiện tại** và **không thấy comment nội bộ**. Khi anh/chị tải lên phiên bản mới, link tự hiện bản mới.
- Quản lý link: trong project bấm **Link chia sẻ** để sao chép, tắt / bật lại, xoá link và xem số lượt xem.
- Link có dạng `APP_URL/s/...`. Khi chưa có tên miền, link chỉ mở được trong mạng nội bộ.

## Duyệt / Cần sửa

- Trên trang xem file có nút **Duyệt**. Bấm vào để chọn **Duyệt** hoặc **Cần sửa**, có thể ghi chú. Danh sách bên dưới cho biết ai đã duyệt và lúc nào.
- Nếu là bản hiện tại, trạng thái file tự đổi thành **Đã chốt** hoặc **Khách yêu cầu sửa**.
- Người phụ trách, người tạo file và người upload nhận thông báo trên chuông. Nhóm Telegram cũng nhận trong bản tin.

## Xuất comment (nút tải xuống cạnh nút chia sẻ)

| Định dạng | Dùng để |
|---|---|
| PDF | Mở trang in, có hình khung hình / trang kèm nét vẽ. Chọn **Lưu thành PDF** trong hộp thoại in |
| Excel (.xlsx) | Danh sách comment: timecode, người viết, nội dung, trả lời, trạng thái |
| Premiere (.xml) | File → Import → chọn file .xml → được một sequence mới có sẵn marker. Copy marker sang sequence đang dựng |
| DaVinci Resolve (.edl) | Chuột phải timeline trong Media Pool → Timelines → Import → **Timeline Markers from EDL**. Marker đỏ là chưa xong, xanh lá đã xong, vàng là nội bộ |

Marker EDL tính từ **01:00:00:00** (mặc định timeline của Resolve).
