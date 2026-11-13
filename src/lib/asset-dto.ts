// Dữ liệu file gửi xuống giao diện (dùng chung server/client).
export type VersionDTO = {
  id: string;
  versionNo: number;
  originalName: string;
  mimeType: string;
  kind: string;
  size: number;
  durationSec: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  status: "UPLOADING" | "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  progress: number;
  error: string | null;
  hasProxy: boolean;
  /** bản xem đã bị dọn để tiết kiệm ổ đĩa, mở lại sẽ tự tạo lại */
  purged: boolean;
  hasThumb: boolean;
  spriteCols: number | null;
  spriteCount: number | null;
  hasWaveform: boolean;
  hasPages: boolean;
  onDrive: boolean;
  uploadedBy: string | null;
  createdAt: string;
};

export type AssetDTO = {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  kind: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  versionCount: number;
  commentCount: number;
  version: VersionDTO | null;
};
