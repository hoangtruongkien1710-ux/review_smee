import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { STATUSES } from "@/lib/statuses";
import { sync } from "@/lib/drive-sync";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(1, "Tên file trống").max(255).optional(),
  status: z.enum(STATUSES.map((s) => s.key) as [string, ...string[]]).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const a = await prisma.asset.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, "Không tìm thấy file");
  await requireProject(me, a.projectId, "EDITOR");
  const b = await parse(req, Body);
  if (b.assigneeId && !(await prisma.user.findUnique({ where: { id: b.assigneeId } })))
    throw new HttpError(400, "Người phụ trách không tồn tại");
  await prisma.asset.update({
    where: { id },
    data: {
      name: b.name,
      status: b.status,
      assigneeId: b.assigneeId,
      dueDate: b.dueDate === undefined ? undefined : b.dueDate ? new Date(b.dueDate) : null,
    },
  });
  if (b.name && b.name !== a.name) sync.renameAsset(id);
  return { ok: true };
});
