import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="text-5xl font-bold text-line-2">404</div>
      <p className="text-mut">Không tìm thấy trang hoặc bạn không có quyền xem.</p>
      <Link href="/" className="btn-outline">
        Về trang chủ
      </Link>
    </div>
  );
}
