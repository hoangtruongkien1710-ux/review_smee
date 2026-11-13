import { LOGIN_RE, LOGIN_MSG } from "@/lib/utils";
import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, hashPassword, requireAdmin, requireUser } from "@/lib/auth";
import { randomColor } from "@/lib/utils";

export const GET = route(async () => {
  await requireUser();
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, email: true, color: true, role: true },
    orderBy: { name: "asc" },
  });
  return { users };
});

const Body = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên").max(80),
  email: z.string().trim().toLowerCase().regex(LOGIN_RE, LOGIN_MSG),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự").max(200),
  role: z.enum(["ADMIN", "MEMBER", "CLIENT"]).default("MEMBER"),
});

export const POST = route(async (req) => {
  const me = await requireAdmin();
  const b = await parse(req, Body);
  if (b.role === "ADMIN" && me.role !== "OWNER") throw new HttpError(403, "Chỉ chủ sở hữu mới tạo được Admin");
  if (await prisma.user.findUnique({ where: { email: b.email } })) throw new HttpError(400, "Tên đăng nhập này đã có người dùng");
  const u = await prisma.user.create({
    data: { name: b.name, email: b.email, passwordHash: hashPassword(b.password), role: b.role, color: randomColor() },
  });
  return { id: u.id };
});
