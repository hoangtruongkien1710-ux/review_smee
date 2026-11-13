import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { projectRole } from "@/lib/access";
import { getAsset, versionDTO } from "@/lib/assets";
import { CompareView } from "@/components/review/CompareView";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; assetId: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const user = await requirePageUser();
  const { id, assetId } = await params;
  const sp = await searchParams;
  const role = await projectRole(user, id);
  if (!role) notFound();
  const asset = await getAsset(assetId);
  if (!asset || asset.projectId !== id || asset.deletedAt) notFound();
  const project = await prisma.project.findUniqueOrThrow({ where: { id } });
  const versions = (
    await prisma.version.findMany({
      where: { assetId },
      orderBy: { versionNo: "desc" },
      include: { uploadedBy: { select: { name: true } } },
    })
  ).map(versionDTO);
  const has = (x?: string) => !!x && versions.some((v) => v.id === x);
  const b = has(sp.b) ? sp.b! : versions[0]?.id;
  const a = has(sp.a) && sp.a !== b ? sp.a! : (versions.find((v) => v.id !== b)?.id ?? b);
  return <CompareView project={{ id: project.id, name: project.name }} asset={asset} versions={versions} initialA={a} initialB={b} />;
}
