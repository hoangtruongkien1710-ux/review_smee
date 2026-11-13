// Link chia sẻ gửi xuống giao diện (dùng chung server/client).
export type ShareDTO = {
  id: string;
  token: string;
  name: string;
  hasPassword: boolean;
  expiresAt: string | null;
  allowDownload: boolean;
  allowComment: boolean;
  allowApprove: boolean;
  disabled: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  assets: { id: string; name: string }[];
  folders: { id: string; name: string }[];
};

