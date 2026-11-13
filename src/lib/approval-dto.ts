// Dữ liệu duyệt phiên bản (dùng chung server/client).
export type ApprovalDTO = {
  id: string;
  versionId: string;
  decision: "APPROVED" | "CHANGES";
  note: string;
  name: string;
  color: string | null;
  guest: boolean;
  createdAt: string;
};
