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
    include: {
      project: { select: { id: true, name: true } },
      assets: { orderBy: { sortOrder: "asc" }, select: { assetId: true } },
      folders: { orderBy: { sortOrder: "asc" }, select: { folderId: true } },
    },
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

export type ShareFolder = { id: string; name: string; parentId: string | null };

/** Phạm vi link: các thư mục được chia sẻ (gồm cả thư mục con) và file chia sẻ lẻ. */
export async function shareScope(share: ShareRow) {
  const direct = new Set(share.assets.map((a) => a.assetId));
  const folders = new Map<string, ShareFolder>();
  const roots: ShareFolder[] = [];
  if (share.folders.length) {
    const all = await prisma.folder.findMany({ where: { projectId: share.projectId }, select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } });
    const byId = new Map(all.map((f) => [f.id, f]));
    const kids = new Map<string, ShareFolder[]>();
    for (const f of all) if (f.parentId) kids.set(f.parentId, [...(kids.get(f.parentId) ?? []), f]);
    const walk = (f: ShareFolder) => {
      if (folders.has(f.id)) return;
      folders.set(f.id, f);
      for (const k of kids.get(f.id) ?? []) walk(k);
    };
    for (const { folderId } of share.folders) {
      const f = byId.get(folderId);
      if (f && !folders.has(f.id)) roots.push(f);
      if (f) walk(f);
    }
    // thư mục được chia sẻ nằm trong thư mục khác cũng được chia sẻ → không hiện ở gốc
    for (let i = roots.length - 1; i >= 0; i--) {
      let p = roots[i].parentId;
      while (p && !share.folders.some((x) => x.folderId === p)) p = byId.get(p)?.parentId ?? null;
      if (p) roots.splice(i, 1);
    }
  }
  const rootIds = new Set(roots.map((r) => r.id));
  /** Đường dẫn từ thư mục gốc được chia sẻ tới thư mục f (để hiện breadcrumb, đặt tên trong file zip). */
  const pathOf = (id: string): ShareFolder[] => {
    const out: ShareFolder[] = [];
    let f = folders.get(id);
    while (f) {
      out.unshift(f);
      if (rootIds.has(f.id)) break;
      f = f.parentId ? folders.get(f.parentId) : undefined;
    }
    return out;
  };
  const has = (a: { id: string; folderId: string | null }) => direct.has(a.id) || (!!a.folderId && folders.has(a.folderId));
  return { direct, folders, roots, pathOf, has };
}

/** Asset có nằm trong link không (và chưa bị xoá). */
export async function requireSharedAsset(share: ShareRow, assetId: string) {
  const a = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!a || a.deletedAt || a.projectId !== share.projectId) throw new HttpError(404, "Không tìm thấy file");
  if (!share.assets.some((x) => x.assetId === assetId)) {
    const scope = share.folders.length ? await shareScope(share) : null;
    if (!scope?.has(a)) throw new HttpError(404, "Không tìm thấy file");
  }
  return a;
}

const unlockFails = new Map<string, { n: number; until: number }>();

/** Nhập mật khẩu đúng → đặt cookie mở khoá (30 ngày). */
export async function unlockShare(token: string, password: string) {
  const share = await findShare(token);
  if (!share || share.disabled) throw new HttpError(404, "Link không tồn tại hoặc đã bị tắt");
  if (!share.passwordHash) return;
  // chống dò mật khẩu: tối đa 10 lần sai / 15 phút cho mỗi link
  const f = unlockFails.get(token);
  if (f && f.n >= 10 && f.until > Date.now()) throw new HttpError(429, "Sai quá nhiều lần, thử lại sau 15 phút");
  if (!verifyPassword(password, share.passwordHash)) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + 15 * 60_000 };
    unlockFails.set(token, { n: cur.n + 1, until: cur.until });
    throw new HttpError(403, "Mật khẩu không đúng");
  }
  unlockFails.delete(token);
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
  folders: { orderBy: { sortOrder: "asc" as const }, include: { folder: { select: { id: true, name: true } } } },
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
  folders: { folder: { id: string; name: string } }[];
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
    folders: s.folders.map((x) => ({ id: x.folder.id, name: x.folder.name })),
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
