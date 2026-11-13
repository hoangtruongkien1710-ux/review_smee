import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { visibleProjectsWhere } from "@/lib/access";
import { ProjectsView, type ProjectRow } from "@/components/ProjectsView";

export default async function HomePage() {
  const user = await requirePageUser();
  const projects = await prisma.project.findMany({
    where: visibleProjectsWhere(user),
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { members: true, assets: { where: { deletedAt: null } } } },
    },
  });
  // Tổng dung lượng theo project
  const sizes = await prisma.$queryRaw<{ projectId: string; total: bigint }[]>`
    SELECT a."projectId", COALESCE(SUM(v.size), 0)::bigint AS total
    FROM "Version" v JOIN "Asset" a ON a.id = v."assetId"
    WHERE a."deletedAt" IS NULL GROUP BY a."projectId"`;
  const sizeMap = new Map(sizes.map((s) => [s.projectId, Number(s.total)]));

  const rows: ProjectRow[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    archived: p.archived,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    assetCount: p._count.assets,
    memberCount: p._count.members,
    size: sizeMap.get(p.id) ?? 0,
  }));

  return <ProjectsView projects={rows} canCreate={user.role !== "CLIENT"} />;
}
