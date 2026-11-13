import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";

const Body = z.object({
  projectId: z.string(),
  parentId: z.string().nullable().optional(),
  name: z.string().trim().min(1, "Vui lòng nhập tên thư mục").max(120),
});

export const POST = route(async (req) => {
  const me = await requireUser();
  const b = await parse(req, Body);
  await requireProject(me, b.projectId, "EDITOR");
  if (b.parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: b.parentId, projectId: b.projectId } });
    if (!parent) throw new HttpError(400, "Thư mục cha không tồn tại");
  }
  const f = await prisma.folder.create({
    data: { projectId: b.projectId, parentId: b.parentId ?? null, name: b.name },
  });
  await prisma.project.update({ where: { id: b.projectId }, data: { updatedAt: new Date() } });
  return { id: f.id };
});
