import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await requireProject(me, id);
  const members = await prisma.projectMember.findMany({
    where: { projectId: id },
    include: { user: { select: { id: true, name: true, email: true, color: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { members };
});

const Put = z.object({
  userId: z.string(),
  role: z.enum(["MANAGER", "EDITOR", "COMMENTER", "VIEWER"]),
});

/** Thêm hoặc đổi quyền một thành viên. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await requireProject(me, id, "MANAGER");
  const b = await parse(req, Put);
  const u = await prisma.user.findUnique({ where: { id: b.userId } });
  if (!u || u.status !== "ACTIVE") throw new HttpError(404, "Không tìm thấy người dùng");
  if (u.role === "CLIENT" && (b.role === "MANAGER" || b.role === "EDITOR"))
    throw new HttpError(400, "Khách hàng chỉ có quyền Chỉ comment hoặc Chỉ xem");
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: id, userId: b.userId } },
    create: { projectId: id, userId: b.userId, role: b.role },
    update: { role: b.role },
  });
  return { ok: true };
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await requireProject(me, id, "MANAGER");
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) throw new HttpError(400, "Thiếu userId");
  await prisma.projectMember.deleteMany({ where: { projectId: id, userId } });
  return { ok: true };
});
