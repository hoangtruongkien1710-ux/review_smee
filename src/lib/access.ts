import "server-only";
import { prisma } from "./db";
import { HttpError, isAdmin, type SessionUser } from "./auth";
import type { ProjectRole, Prisma } from "@/generated/prisma/client";

const RANK: Record<ProjectRole, number> = { VIEWER: 1, COMMENTER: 2, EDITOR: 3, MANAGER: 4 };

/** Quyền của user trong project (admin/owner = MANAGER ở mọi project). null = không có quyền. */
export async function projectRole(user: SessionUser, projectId: string): Promise<ProjectRole | null> {
  if (isAdmin(user)) return "MANAGER";
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  return m?.role ?? null;
}

export async function requireProject(user: SessionUser, projectId: string, min: ProjectRole = "VIEWER") {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Không tìm thấy project");
  const role = await projectRole(user, projectId);
  if (!role) throw new HttpError(404, "Không tìm thấy project");
  if (RANK[role] < RANK[min]) throw new HttpError(403, "Bạn không có quyền làm việc này trong project");
  return { project, role };
}

export function can(role: ProjectRole | null, min: ProjectRole) {
  return !!role && RANK[role] >= RANK[min];
}

/** Điều kiện lọc các project user được xem. */
export function visibleProjectsWhere(user: SessionUser): Prisma.ProjectWhereInput {
  if (isAdmin(user)) return {};
  return { members: { some: { userId: user.id } } };
}
