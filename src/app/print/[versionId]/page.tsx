import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { projectRole } from "@/lib/access";
import { orderedComments } from "@/lib/export";
import { PrintView } from "@/components/PrintView";

export const dynamic = "force-dynamic";

/** Trang in danh sách comment (Ctrl+P → Lưu thành PDF). */
export default async function PrintPage({ params }: { params: Promise<{ versionId: string }> }) {
  const me = await requirePageUser();
  const { versionId } = await params;
  const v = await prisma.version.findUnique({ where: { id: versionId }, include: { asset: { include: { project: true } } } });
  if (!v || v.asset.deletedAt) notFound();
  if (!(await projectRole(me, v.asset.projectId))) notFound();
  const comments = await orderedComments(me, v);
  return (
    <PrintView
      project={v.asset.project.name}
      asset={v.asset.name}
      version={{
        id: v.id,
        versionNo: v.versionNo,
        kind: v.kind,
        fps: v.fps,
        durationSec: v.durationSec,
        width: v.width,
        height: v.height,
        hasSprite: !!v.spriteKey,
        spriteCols: v.spriteCols,
        spriteCount: v.spriteCount,
        hasPages: !!v.pagesKey,
        hasProxy: !!v.proxyKey,
      }}
      comments={comments}
      printedBy={me.name}
    />
  );
}
