import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { STAFF_DEFAULT_ROLE, can, visibleProjectsWhere } from "@/lib/access";

/** Các project (kèm cây thư mục) mà người dùng được phép chuyển file/thư mục tới (cần quyền Editor trở lên). */
export const GET = route(async () => {
  const me = await requireUser();
  const projects = await prisma.project.findMany({
    where: { archived: false, ...visibleProjectsWhere(me) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      members: { where: { userId: me.id }, select: { role: true } },
      folders: { select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } },
    },
  });
  return {
    projects: projects
      .filter((p) => isAdmin(me) || can(p.members[0]?.role ?? (me.role === "MEMBER" ? STAFF_DEFAULT_ROLE : null), "EDITOR"))
      .map((p) => ({ id: p.id, name: p.name, color: p.color, folders: p.folders })),
  };
});
