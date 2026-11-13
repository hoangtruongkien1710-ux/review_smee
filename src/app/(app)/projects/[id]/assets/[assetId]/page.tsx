import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { can, projectRole } from "@/lib/access";
import { getAsset, listAssets, versionDTO } from "@/lib/assets";
import { ReviewView } from "@/components/review/ReviewView";

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; assetId: string }>;
  searchParams: Promise<{ c?: string; v?: string }>;
}) {
  const user = await requirePageUser();
  const { id, assetId } = await params;
  const sp = await searchParams;
  const role = await projectRole(user, id);
  if (!role) notFound();
  const asset = await getAsset(assetId);
  if (!asset || asset.projectId !== id || asset.deletedAt) notFound();
  const project = await prisma.project.findUniqueOrThrow({ where: { id } });
  const folder = asset.folderId ? await prisma.folder.findUnique({ where: { id: asset.folderId } }) : null;
  const siblings = await listAssets({ projectId: id, folderId: asset.folderId, deletedAt: null });
  siblings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const versions = await prisma.version.findMany({
    where: { assetId },
    orderBy: { versionNo: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  // Mở từ link comment: chọn đúng phiên bản chứa comment đó
  let initialVersionId: string | null = sp.v && versions.some((x) => x.id === sp.v) ? sp.v : null;
  if (sp.c) {
    const c = await prisma.comment.findUnique({ where: { id: sp.c }, select: { assetId: true, versionId: true, internal: true } });
    if (c && c.assetId === assetId && !(c.internal && user.role === "CLIENT")) initialVersionId = c.versionId;
  }

  return (
    <ReviewView
      key={assetId}
      project={{ id: project.id, name: project.name }}
      folder={folder ? { id: folder.id, name: folder.name } : null}
      asset={asset}
      versions={versions.map(versionDTO)}
      siblingIds={siblings.map((s) => s.id)}
      me={{ id: user.id, name: user.name, color: user.color, role: user.role }}
      canEdit={can(role, "EDITOR")}
      canComment={can(role, "COMMENTER")}
      canManage={can(role, "MANAGER")}
      initialVersionId={initialVersionId}
      initialCommentId={sp.c ?? null}
    />
  );
}
