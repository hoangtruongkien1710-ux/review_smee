import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { shareScope, shareState, touchShare } from "@/lib/share";
import { getAsset, versionDTO } from "@/lib/assets";
import { ShareGate } from "@/components/ShareGate";
import { ReviewView } from "@/components/review/ReviewView";

export default async function ShareAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; assetId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { token, assetId } = await params;
  const sp = await searchParams;
  const st = await shareState(token);
  if (!st.ok) return <ShareGate token={token} reason={st.reason} name={st.share?.name} />;
  const share = st.share;
  const asset = await getAsset(assetId);
  if (!asset || asset.deletedAt || asset.projectId !== share.projectId || !asset.version) notFound();
  const scope = await shareScope(share);
  if (!scope.has(asset)) notFound();
  await touchShare(share.id);

  // file chia sẻ lẻ: chuyển qua lại giữa các file lẻ; file trong thư mục: giữa các file cùng thư mục
  const inFolder = !scope.direct.has(asset.id) && asset.folderId ? scope.folders.get(asset.folderId) ?? null : null;
  let siblingIds: string[];
  if (inFolder) {
    const rows = await prisma.asset.findMany({
      where: { projectId: share.projectId, folderId: inFolder.id, deletedAt: null },
      select: { id: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    siblingIds = rows.map((x) => x.id);
  } else {
    const live = await prisma.asset.findMany({
      where: { id: { in: share.assets.map((a) => a.assetId) }, deletedAt: null },
      select: { id: true },
    });
    const liveSet = new Set(live.map((x) => x.id));
    siblingIds = share.assets.map((a) => a.assetId).filter((id) => liveSet.has(id));
  }
  const current = await prisma.version.findUniqueOrThrow({
    where: { id: asset.version.id },
    include: { uploadedBy: { select: { name: true } } },
  });

  return (
    <ReviewView
      key={assetId}
      project={{ id: share.project.id, name: share.project.name }}
      folder={inFolder ? { id: inFolder.id, name: inFolder.name } : null}
      asset={{ ...asset, commentCount: 0, assigneeName: null, assigneeId: null }}
      versions={[versionDTO(current)]}
      siblingIds={siblingIds}
      me={{ id: "guest", name: "Guest", color: "#9aa1ad", role: "CLIENT" }}
      canEdit={false}
      canComment={share.allowComment}
      canManage={false}
      initialCommentId={sp.c ?? null}
      guest={{
        token,
        shareName: share.name,
        allowDownload: share.allowDownload,
        allowComment: share.allowComment,
        allowApprove: share.allowApprove,
      }}
    />
  );
}
