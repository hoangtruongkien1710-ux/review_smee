// Trạng thái duyệt mặc định (kehoach.md mục 5.4). Sau này Admin sửa được trong Cài đặt.
export const STATUSES = [
  { key: "not_started", label: "Chưa bắt đầu", color: "#6B7280" },
  { key: "in_progress", label: "Đang làm", color: "#06B6D4" },
  { key: "internal_review", label: "Cần duyệt nội bộ", color: "#F5A524" },
  { key: "client_review", label: "Chờ khách duyệt", color: "#7C83FD" },
  { key: "changes_requested", label: "Khách yêu cầu sửa", color: "#F43F5E" },
  { key: "approved", label: "Đã chốt", color: "#17C964" },
] as const;

export type StatusKey = (typeof STATUSES)[number]["key"];

export function statusOf(key: string) {
  return STATUSES.find((s) => s.key === key) ?? STATUSES[0];
}
