import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smee Review",
  description: "Review & duyệt video nội bộ - Smee Agency",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
