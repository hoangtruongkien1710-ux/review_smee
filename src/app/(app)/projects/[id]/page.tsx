import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { projectRole } from "@/lib/access";
import { listAssets } from "@/lib/assets";
import { ProjectView } from "@/components/ProjectView";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ folder?: string; view?: string }>;
}) {
  const user = await requirePageUser();
  const { id } = await params;
  const { folder, view } = await searchParams;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();
  const role = await projectRole(user, id);
  if (!role) notFound();

  const trash = view === "trash";
  const [folders, members, trashCount] = await Promise.all([
    prisma.folder.findMany({ where: { projectId: id }, orderBy: { name: "asc" } }),
    prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, name: true, email: true, color: true, role: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.asset.count({ where: { projectId: id, deletedAt: { not: null } } }),
  ]);
  const currentFolder = !trash && folder && folders.some((f) => f.id === folder) ? folder : null;
  const assets = await listAssets(
    trash ? { projectId: id, deletedAt: { not: null } } : { projectId: id, folderId: currentFolder, deletedAt: null },
  );

  return (
    <ProjectView
      project={{ id: project.id, name: project.name, description: project.description, color: project.color, archived: project.archived }}
      role={role}
      folders={folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }))}
      members={members.map((m) => ({ ...m.user, projectRole: m.role }))}
      currentFolderId={currentFolder}
      assets={assets}
      trash={trash}
      trashCount={trashCount}
    />
  );
}
