# Smee Review

Ứng dụng review & duyệt video nội bộ của Smee Agency (Next.js + PostgreSQL + Prisma, chạy bằng Docker).
Kế hoạch chi tiết: xem [kehoach.md](kehoach.md).

## Chạy thử trên máy Windows (Docker Desktop)

1. Mở **Docker Desktop** và đợi tới khi báo "Engine running".
2. Mở thư mục này trong File Explorer, bấm vào thanh địa chỉ, gõ `powershell` rồi Enter.
3. Chạy lệnh (lần đầu mất khoảng 3–5 phút để tải và build):

   ```powershell
   docker compose up -d --build
   ```

4. Mở trình duyệt: <http://localhost:3000>
5. Lần đầu sẽ hiện trang **Cài đặt lần đầu**: tạo tài khoản chủ sở hữu (Owner).
6. Vào **Cài đặt** (bánh răng góc trái dưới) → **Thêm người dùng** để tạo tài khoản cho nhân viên.

### Các lệnh hay dùng

| Việc | Lệnh |
|---|---|
| Xem trạng thái | `docker compose ps` |
| Xem log | `docker compose logs -f web` |
| Xem log xử lý video | `docker compose logs -f worker` |
| Dừng app | `docker compose down` |
| Cập nhật sau khi có code mới | `docker compose up -d --build` |
| Xoá sạch dữ liệu thử (cẩn thận!) | `docker compose down -v` |

Dữ liệu (database, file) nằm trong Docker volume nên dừng/khởi động lại không mất.

### Kết nối Google Drive

Xem hướng dẫn: [docs/google-drive.md](docs/google-drive.md). Chưa kết nối thì file gốc giữ trên máy chủ.

### Thông báo Telegram

Xem [docs/telegram.md](docs/telegram.md).

### Chia sẻ cho khách, duyệt, xuất comment

Xem [docs/chia-se-duyet-xuat.md](docs/chia-se-duyet-xuat.md).

### Tên miền + HTTPS

Xem [docs/ten-mien.md](docs/ten-mien.md).

### Đổi cổng hoặc mật khẩu database

Sao chép `.env.example` thành `.env` rồi sửa. Ví dụ cổng 3000 đang bị chiếm thì đặt `APP_PORT=3005`
và `APP_URL=http://localhost:3005`.

## Cấu trúc thư mục

```
prisma/schema.prisma     mô hình dữ liệu
prisma/migrations/       lịch sử thay đổi database (tự chạy khi khởi động)
src/app/                 các trang và API (Next.js App Router)
src/components/          giao diện
src/lib/                 đăng nhập, phân quyền, database, lưu file, Google Drive
src/worker/              worker xử lý file (FFmpeg, LibreOffice) và đẩy lên Drive
secrets/                 file bí mật (khoá Google) - không đưa lên Git
docs/                    hướng dẫn
docker/entrypoint.sh     lệnh khởi động trong container
Dockerfile, docker-compose.yml
```

## Phát triển (không bắt buộc)

Cần Node.js 22+ và một PostgreSQL. Tạo `.env` có `DATABASE_URL=postgresql://...`, rồi:

```bash
npm install
npx prisma migrate dev
npm run dev        # web
npm run worker     # worker xử lý file (cần ffmpeg, pdftoppm, soffice trong PATH)
```

## Phím tắt trong trình xem

Space phát/dừng · J/K/L tua lùi/dừng/tới · ←/→ từng khung hình (Shift: 1 giây) · I/O điểm vào/ra · X bỏ In/Out · M tắt tiếng · F toàn màn hình · C viết comment · ? xem bảng phím tắt.

## Tiến độ

- [x] B1. Nền tảng: đăng nhập, project, thư mục, thành viên, quản lý người dùng, Docker
- [x] B2. Upload hoàn chỉnh (file lớn, tiếp tục khi rớt mạng) + FFmpeg + LibreOffice + Google Drive
- [x] B3. Trình xem + comment theo timeline, vẽ lên khung hình, ghim trên ảnh/PDF, @nhắc tên, thông báo
- [x] B4. Phiên bản: comment chưa xong mang sang bản mới, đặt bản hiện tại, xoá phiên bản, so sánh cạnh nhau / trượt, phát đồng bộ
- [ ] B5. Đưa lên VPS
