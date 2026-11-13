// Dữ liệu comment gửi xuống giao diện (dùng chung server/client).

/** Một nét vẽ trên khung hình. Toạ độ chuẩn hoá 0..1 theo khung hình, w là độ dày theo tỉ lệ chiều rộng. */
export type Shape = {
  t: "pen" | "arrow" | "rect" | "ellipse";
  c: string;
  w: number;
  p: number[]; // [x1, y1, x2, y2, ...]
};
export type Annotation = { shapes: Shape[] };

export type CommentDTO = {
  id: string;
  versionId: string | null;
  parentId: string | null;
  author: { id: string; name: string; color: string } | null;
  guestName: string | null;
  body: string;
  timeStart: number | null;
  timeEnd: number | null;
  page: number | null;
  pinX: number | null;
  pinY: number | null;
  annotation: Annotation | null;
  internal: boolean;
  resolved: boolean;
  createdAt: string;
  edited: boolean;
  /** Comment chưa xong mang sang từ phiên bản cũ (số phiên bản gốc), null nếu thuộc bản đang xem. */
  fromVersionNo: number | null;
  replies: CommentDTO[];
};

export type Person = { id: string; name: string; color: string; email: string; client: boolean };

/** Nhắc tên được lưu trong nội dung dạng @[Tên](userId). */
export const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([a-z0-9]{10,40})\)/g;

export function mentionIds(body: string) {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[2]))];
}

/** Nội dung thuần (bỏ mã nhắc tên) — dùng cho thông báo, trích dẫn. */
export function plainText(body: string) {
  return body.replace(MENTION_RE, (_m, name) => `@${name}`);
}
