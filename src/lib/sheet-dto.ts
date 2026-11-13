// Dữ liệu bảng tính gửi xuống trình xem (worker tạo file sheet.json).
/** Ô: v = chữ hiển thị; b/i/u/s = đậm/nghiêng/gạch chân/gạch ngang; c = màu chữ; bg = màu nền; al = căn (c/r); w = xuống dòng */
export type SheetCell = { v: string; b?: 1; i?: 1; u?: 1; s?: 1; c?: string; bg?: string; al?: "c" | "r"; w?: 1 };

export type SheetData = {
  name: string;
  hidden?: boolean;
  rows: (SheetCell | null)[][];
  /** độ rộng cột (px), 0 = ẩn */
  widths: number[];
  /** chiều cao dòng (px) hoặc null = mặc định, 0 = ẩn */
  heights: (number | null)[];
  /** vùng gộp ô [dòng1, cột1, dòng2, cột2], đếm từ 0 */
  merges: [number, number, number, number][];
  freezeRows: number;
  freezeCols: number;
  truncated?: { rows: number; cols: number };
};

export type SheetFile = { sheets: SheetData[] };
