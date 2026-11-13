import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, hashPassword, requireAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(["ADMIN", "MEMBER", "CLIENT"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự").max(200).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const me = await requireAdmin();
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new HttpError(404, "Không tìm thấy người dùng");
  const b = await parse(req, Body);
  if (target.role === "OWNER" && me.id !== target.id) throw new HttpError(403, "Không thể sửa tài khoản chủ sở hữu");
  if (target.role === "OWNER" && (b.role || b.status)) throw new HttpError(400, "Không đổi được vai trò/trạng thái của chủ sở hữu");
  if ((b.role === "ADMIN" || target.role === "ADMIN") && me.role !== "OWNER" && b.role)
    throw new HttpError(403, "Chỉ chủ sở hữu mới đổi vai trò Admin");
  await prisma.user.update({
    where: { id },
    data: {
      name: b.name,
      role: b.role,
      status: b.status,
      passwordHash: b.password ? hashPassword(b.password) : undefined,
    },
  });
  if (b.status === "DISABLED" || b.password) await prisma.session.deleteMany({ where: { userId: id } });
  return { ok: true };
});
