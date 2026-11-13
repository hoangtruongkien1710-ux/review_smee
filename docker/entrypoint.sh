#!/bin/sh
set -e
case "$1" in
  web)
    echo "[smee] Cập nhật cấu trúc database (prisma migrate deploy)…"
    ./node_modules/.bin/prisma migrate deploy
    echo "[smee] Khởi động web tại cổng 3000"
    exec ./node_modules/.bin/next start -p 3000 -H 0.0.0.0
    ;;
  worker)
    echo "[smee] Khởi động worker xử lý file"
    exec ./node_modules/.bin/tsx src/worker/index.ts
    ;;
  *)
    exec "$@"
    ;;
esac
