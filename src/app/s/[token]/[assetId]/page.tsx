import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { shareState, touchShare } from "@/lib/share";
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
  if (!share.assets.some((a) => a.assetId === assetId)) notFound();
  const asset = await getAsset(assetId);
  if (!asset || asset.deletedAt || asset.projectId !== share.projectId || !asset.version) notFound();
  await touchShare(share.id);

  const live = await prisma.asset.findMany({
    where: { id: { in: share.assets.map((a) => a.assetId) }, deletedAt: null },
    select: { id: true },
  });
  const liveSet = new Set(live.map((x) => x.id));
  const siblingIds = share.assets.map((a) => a.assetId).filter((id) => liveSet.has(id));
  const current = await prisma.version.findUniqueOrThrow({
    where: { id: asset.version.id },
    include: { uploadedBy: { select: { name: true } } },
  });

  return (
    <ReviewView
      key={assetId}
      project={{ id: share.project.id, name: share.project.name }}
      folder={null}
      asset={{ ...asset, commentCount: 0, assigneeName: null, assigneeId: null }}
      versions={[versionDTO(current)]}
      siblingIds={siblingIds}
      me={{ id: "guest", name: "Khách", color: "#9aa1ad", role: "CLIENT" }}
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
