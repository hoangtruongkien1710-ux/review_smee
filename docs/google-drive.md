# Kết nối Google Drive (lưu file gốc)

App tự đẩy **file gốc** lên thư mục Drive của công ty, mỗi project một thư mục, thư mục con giống trong app.
Bản xem nhẹ và thumbnail vẫn nằm trên VPS để phát nhanh.

Thư mục gốc đã chọn: `https://drive.google.com/drive/folders/1RrmAoaGS5ufRVFKcBR4SE2RO1Q84dwGU`

> Chưa kết nối thì app vẫn chạy bình thường, file gốc giữ trên ổ VPS. Kết nối sau, worker sẽ tự đẩy dần các file cũ lên Drive.

## Trước tiên: thư mục này nằm ở đâu?

Mở link thư mục trên Drive và nhìn cột bên trái:

- Nằm dưới **Bộ nhớ dùng chung (Shared drives)** → làm **Cách 1** (khuyên dùng).
- Nằm dưới **Drive của tôi (My Drive)** → service account không upload vào đây được (Google không cấp dung lượng cho service account).
  Nên tạo một Shared Drive (ví dụ "Smee Review"), chuyển thư mục vào đó rồi làm Cách 1.
  Hoặc giữ nguyên ở "Drive của tôi" và làm **Cách 0** (Apps Script) bên dưới.

## Cách 0: Apps Script (thư mục trong "Drive của tôi", khoảng 5 phút, không cần Google Cloud)

App xin "vé" truy cập Drive từ một Apps Script chạy dưới tài khoản chủ thư mục. File tải lên dùng dung lượng của tài khoản đó.

1. Đăng nhập Google bằng tài khoản **chủ thư mục** (người tạo thư mục trên Drive).
2. Mở <https://script.google.com> → **Dự án mới**, đặt tên `Smee Review Drive`.
3. Xoá mã có sẵn, dán toàn bộ nội dung file [`docs/apps-script.gs`](apps-script.gs).
   Sửa dòng `const SECRET = '...'` thành một chuỗi dài khó đoán (ví dụ 30 ký tự chữ + số).
   Bấm vào file **appsscript.json** (nếu không thấy: biểu tượng bánh răng **Cài đặt dự án** → tick
   "Hiển thị tệp kê khai appsscript.json"), thay toàn bộ bằng nội dung file
   [`docs/apps-script-appsscript.json`](apps-script-appsscript.json) để script có đủ quyền Google Drive.
4. Ở thanh trên chọn hàm **setup** → bấm **Chạy** → **Xem xét quyền** → chọn tài khoản → **Cho phép**.
   (Nếu hiện "Google chưa xác minh ứng dụng này": bấm **Nâng cao** → **Đi tới Smee Review Drive**.)
5. **Triển khai → Tuỳ chọn triển khai mới** → biểu tượng bánh răng → **Ứng dụng web**:
   - Thực thi với tư cách: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
   → **Triển khai** → copy **URL ứng dụng web** (kết thúc bằng `/exec`).
   - Nếu không có lựa chọn "Bất kỳ ai": quản trị viên Workspace đang chặn, cần mở trong Admin console
     (Apps Script → cho phép chia sẻ ứng dụng web ra ngoài tổ chức) hoặc dùng Cách 1.
6. Mở file `.env` trong thư mục app (chưa có thì sao chép từ `.env.example`), đặt:
   ```
   GOOGLE_DRIVE_ROOT_FOLDER_ID=<ID thư mục, phần sau /folders/ trong link>
   GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/..../exec
   GOOGLE_APPS_SCRIPT_KEY=<chuỗi SECRET ở bước 3>
   ```
7. Khởi động lại: `docker compose up -d`, rồi kiểm tra `docker compose logs worker` có dòng
   `Google Drive: đã kết nối thư mục "..."`.

**Giữ bí mật** URL + SECRET (không gửi qua chat, không đưa lên Git). Muốn thu hồi: đổi SECRET và triển khai lại.

## Cách 1: Service account (khoảng 10 phút)

1. Vào <https://console.cloud.google.com>, đăng nhập bằng tài khoản Google Workspace công ty.
   Tạo project mới, đặt tên `Smee Review`.
2. Menu **APIs & Services → Library**, tìm **Google Drive API**, bấm **Enable**.
3. Menu **IAM & Admin → Service Accounts → Create service account**.
   Tên: `smee-review-drive` → **Create and continue** → **Done** (không cần cấp role).
4. Bấm vào service account vừa tạo → tab **Keys → Add key → Create new key → JSON**. Trình duyệt tải về 1 file `.json`.
   - Nếu báo "Service account key creation is disabled": quản trị viên Workspace cần tắt chính sách
     `iam.disableServiceAccountKeyCreation` cho project này.
5. Đổi tên file thành `google-service-account.json` và chép vào thư mục `secrets` trong thư mục app.
   **Không gửi file này cho ai, không đưa lên Git.**
6. Mở file JSON, copy địa chỉ trong dòng `client_email` (dạng `smee-review-drive@....iam.gserviceaccount.com`).
7. Trên Google Drive, vào Shared Drive chứa thư mục → **Quản lý thành viên** → thêm email ở bước 6,
   quyền **Người quản lý nội dung (Content manager)**.
8. Mở file `.env` trong thư mục app (chưa có thì sao chép từ `.env.example`), đặt:
   ```
   GOOGLE_DRIVE_ROOT_FOLDER_ID=1RrmAoaGS5ufRVFKcBR4SE2RO1Q84dwGU
   GOOGLE_SERVICE_ACCOUNT_JSON=/secrets/google-service-account.json
   ```
9. Khởi động lại: `docker compose up -d`
10. Kiểm tra: `docker compose logs worker` phải có dòng
    `Google Drive: đã kết nối thư mục "..."`.

## App làm gì trên Drive

| Trong app | Trên Drive |
|---|---|
| Upload file | File gốc vào thư mục tương ứng (tự tạo thư mục project/thư mục con) |
| Phiên bản mới | Thêm file `ten-file_v2.mp4` cạnh bản cũ |
| Đổi tên / di chuyển | Đổi tên / di chuyển theo |
| Xoá (vào thùng rác) | Chuyển vào thư mục `_Thùng rác` của project |
| Khôi phục | Trả về chỗ cũ |
| Xoá vĩnh viễn / Xoá phiên bản | File vào Thùng rác của Google Drive (khôi phục được 30 ngày, sau đó Google tự xoá) |
| Xoá thư mục | File vào `_Thùng rác`, thư mục Drive vào thùng rác của Google Drive |

Nhân viên nên có quyền **Người xem** trên thư mục Drive; mọi thay đổi làm trong app để hai bên luôn khớp.
