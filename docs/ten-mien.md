# Gắn tên miền review.smee.vn (HTTPS)

Làm khi app đã chạy trên VPS.

## 1. Trỏ tên miền

Vào trang quản lý DNS của smee.vn (nơi mua tên miền, hoặc Cloudflare nếu đang dùng), thêm bản ghi:

| Loại | Tên | Giá trị | TTL |
|---|---|---|---|
| A | `review` | IP của VPS | Auto / 300 |

Nếu dùng Cloudflare: để **DNS only** (đám mây màu xám), vì Cloudflare gói free giới hạn upload 100 MB mỗi request.

Kiểm tra: `nslookup review.smee.vn` ra đúng IP VPS là được (thường vài phút, lâu nhất vài giờ).

## 2. Mở cổng trên VPS

Mở cổng **80** và **443** (TCP, thêm 443 UDP nếu được) ở firewall của VPS / nhà cung cấp.

## 3. Bật HTTPS

Trong `.env` trên VPS:

```
DOMAIN=review.smee.vn
APP_URL=https://review.smee.vn
```

Chạy:

```
docker compose --profile https up -d
```

Caddy tự xin chứng chỉ Let's Encrypt (mất khoảng 30 giây lần đầu) và tự gia hạn. Mở https://review.smee.vn để kiểm tra.

Sau khi chạy ổn, có thể đóng cổng 3000 trên firewall để mọi người chỉ vào qua tên miền.
