import "server-only";
// Link chia sẻ cho khách (không cần tài khoản).
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { HttpError, verifyPassword } from "./auth";
import type { ShareDTO } from "./share-dto";

export const newShareToken = () => crypto.randomBytes(18).toString("base64url");

let secret: string | null = null;
/** Khoá ký cookie mở khoá link có mật khẩu (tạo ngẫu nhiên một lần, lưu trong DB). */
async function shareSecret() {
  if (secret) return secret;
  const key = "share_secret";
  const s = await prisma.setting.findUnique({ where: { key } });
  if (s && typeof s.value === "string") return (secret = s.value);
  const v = crypto.randomBytes(32).toString("hex");
  await prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: {} });
  const again = await prisma.setting.findUniqueOrThrow({ where: { key } });
  return (secret = String(again.value));
}

const cookieName = (token: string) => `sr_share_${token.slice(0, 10)}`;
async function sign(token: string, passwordHash: string) {
  return crypto.createHmac("sha256", await shareSecret()).update(`${token}:${passwordHash}`).digest("base64url");
}

export type ShareRow = NonNullable<Awaited<ReturnType<typeof findShare>>>;

function findShare(token: string) {
  return prisma.shareLink.findUnique({
    where: { token },
    include: { project: { select: { id: true, name: true } }, assets: { orderBy: { sortOrder: "asc" }, select: { assetId: true } } },
  });
}

export type ShareState =
  | { ok: true; share: ShareRow }
  | { ok: false; reason: "missing" | "expired" | "locked"; share?: ShareRow };

/** Kiểm tra link: còn hiệu lực, đã nhập mật khẩu (nếu có). */
export async function shareState(token: string): Promise<ShareState> {
  const share = await findShare(token);
  if (!share || share.disabled) return { ok: false, reason: "missing" };
  if (share.expiresAt && share.expiresAt < new Date()) return { ok: false, reason: "expired", share };
  if (share.passwordHash) {
    const jar = await cookies();
    const c = jar.get(cookieName(token))?.value;
    if (!c || c !== (await sign(token, share.passwordHash))) return { ok: false, reason: "locked", share };
  }
  return { ok: true, share };
}

/** Dùng trong API của khách. Trả về link + danh sách asset được chia sẻ. */
export async function requireShare(token: string) {
  const st = await shareState(token);
  if (!st.ok) {
    if (st.reason === "locked") throw new HttpError(401, "Cần nhập mật khẩu");
    if (st.reason === "expired") throw new HttpError(410, "Link đã hết hạn");
    throw new HttpError(404, "Link không tồn tại hoặc đã bị tắt");
  }
  return st.share;
}

/** Asset có nằm trong link không (và chưa bị xoá). */
export async function requireSharedAsset(share: ShareRow, assetId: string) {
  if (!share.assets.some((a) => a.assetId === assetId)) throw new HttpError(404, "Không tìm thấy file");
  const a = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!a || a.deletedAt || a.projectId !== share.projectId) throw new HttpError(404, "Không tìm thấy file");
  return a;
}

/** Nhập mật khẩu đúng → đặt cookie mở khoá (30 ngày). */
export async function unlockShare(token: string, password: string) {
  const share = await findShare(token);
  if (!share || share.disabled) throw new HttpError(404, "Link không tồn tại hoặc đã bị tắt");
  if (!share.passwordHash) return;
  if (!verifyPassword(password, share.passwordHash)) throw new HttpError(403, "Mật khẩu không đúng");
  const jar = await cookies();
  jar.set(cookieName(token), await sign(token, share.passwordHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: 30 * 86400,
  });
}

export const shareInclude = {
  createdBy: { select: { name: true } },
  assets: { orderBy: { sortOrder: "asc" as const }, include: { asset: { select: { id: true, name: true, deletedAt: true } } } },
};

type ShareWithAssets = {
  id: string;
  token: string;
  name: string;
  passwordHash: string | null;
  expiresAt: Date | null;
  allowDownload: boolean;
  allowComment: boolean;
  allowApprove: boolean;
  disabled: boolean;
  viewCount: number;
  lastViewedAt: Date | null;
  createdAt: Date;
  createdBy: { name: string } | null;
  assets: { asset: { id: string; name: string; deletedAt: Date | null } }[];
};

export function shareDTO(s: ShareWithAssets): ShareDTO {
  return {
    id: s.id,
    token: s.token,
    name: s.name,
    hasPassword: !!s.passwordHash,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    allowDownload: s.allowDownload,
    allowComment: s.allowComment,
    allowApprove: s.allowApprove,
    disabled: s.disabled,
    viewCount: s.viewCount,
    lastViewedAt: s.lastViewedAt?.toISOString() ?? null,
    createdBy: s.createdBy?.name ?? null,
    createdAt: s.createdAt.toISOString(),
    assets: s.assets.filter((x) => !x.asset.deletedAt).map((x) => ({ id: x.asset.id, name: x.asset.name })),
  };
}

/** Ghi nhận lượt xem: mỗi lần mở cách nhau trên 30 phút tính là 1 lượt. */
export async function touchShare(id: string) {
  const now = new Date();
  const n = await prisma.shareLink.updateMany({
    where: { id, OR: [{ lastViewedAt: null }, { lastViewedAt: { lt: new Date(now.getTime() - 30 * 60_000) } }] },
    data: { viewCount: { increment: 1 }, lastViewedAt: now },
  });
  if (!n.count) await prisma.shareLink.update({ where: { id }, data: { lastViewedAt: now } });
}
