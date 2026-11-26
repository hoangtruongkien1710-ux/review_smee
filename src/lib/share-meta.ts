import "server-only";
// Ảnh xem trước + tên khi gửi link chia sẻ qua Zalo, Messenger, Telegram… (thẻ Open Graph).
import type { Metadata } from "next";
import { prisma } from "./db";
import { shareState } from "./share";

const SITE = "Smee Review";

function base() {
  try {
    return new URL(process.env.APP_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

function card(opts: { title: string; description: string; url: string; image?: string | null }): Metadata {
  const images = opts.image ? [{ url: opts.image }] : undefined;
  return {
    metadataBase: base(),
    title: opts.title,
    description: opts.description,
    openGraph: { type: "website", siteName: SITE, title: opts.title, description: opts.description, url: opts.url, images },
    twitter: { card: images ? "summary_large_image" : "summary", title: opts.title, description: opts.description, images: images?.map((i) => i.url) },
  };
}

/**
 * Metadata cho trang chia sẻ. Link có mật khẩu / hết hạn / bị tắt: chỉ hiện tên chung, không lộ tên file hay ảnh
 * (bot của Zalo/Messenger không có cookie mở khoá nên rơi vào nhánh này).
 */
export async function shareMetadata(token: string, assetId?: string, folderId?: string): Promise<Metadata> {
  const url = `/s/${token}${assetId ? `/${assetId}` : folderId ? `?f=${folderId}` : ""}`;
  const generic = card({ title: SITE, description: "Xem và góp ý video cùng Smee Agency", url });
  const st = await shareState(token);
  if (!st.ok) return generic;
  const share = st.share;

  let asset: { id: string; name: string; currentVersionId: string | null } | null = null;
  if (assetId) {
    const a = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, name: true, projectId: true, deletedAt: true, currentVersionId: true } });
    if (!a || a.deletedAt || a.projectId !== share.projectId) return generic;
    asset = a;
  } else if (share.assets.length === 1 && !share.folders.length) {
    // link một file: người mở sẽ được chuyển thẳng tới file đó
    asset = await prisma.asset.findFirst({ where: { id: share.assets[0].assetId, deletedAt: null }, select: { id: true, name: true, currentVersionId: true } });
  } else if (share.assets.length > 0) {
    // nhiều file: lấy ảnh của file đầu tiên làm đại diện
    const first = await prisma.asset.findMany({
      where: { id: { in: share.assets.map((a) => a.assetId) }, deletedAt: null, currentVersion: { thumbKey: { not: null } } },
      select: { id: true, name: true, currentVersionId: true },
      take: 1,
    });
    const rep = first[0];
    return card({
      title: share.name,
      description: `${share.assets.length} file · ${share.project.name}`,
      url,
      image: rep?.currentVersionId ? `/api/share/${token}/files/${rep.currentVersionId}/thumb` : null,
    });
  }
  if (!asset) return card({ title: share.name, description: share.project.name, url });

  let image: string | null = null;
  if (asset.currentVersionId) {
    const v = await prisma.version.findUnique({ where: { id: asset.currentVersionId }, select: { thumbKey: true } });
    if (v?.thumbKey) image = `/api/share/${token}/files/${asset.currentVersionId}/thumb`;
  }
  return card({ title: asset.name, description: `${share.project.name} · ${SITE}`, url, image });
}
