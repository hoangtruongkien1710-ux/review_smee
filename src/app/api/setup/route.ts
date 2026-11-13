import { LOGIN_RE, LOGIN_MSG } from "@/lib/utils";
import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, createSession, hashPassword } from "@/lib/auth";
import { randomColor } from "@/lib/utils";

const Body = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên").max(80),
  email: z.string().trim().toLowerCase().regex(LOGIN_RE, LOGIN_MSG),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự").max(200),
});

/** Tạo tài khoản chủ sở hữu (Owner) đầu tiên. Chỉ chạy được khi chưa có người dùng nào. */
export const POST = route(async (req) => {
  if ((await prisma.user.count()) > 0) throw new HttpError(403, "Hệ thống đã được cài đặt");
  const b = await parse(req, Body);
  const user = await prisma.user.create({
    data: { name: b.name, email: b.email, passwordHash: hashPassword(b.password), role: "OWNER", color: randomColor() },
  });
  await createSession(user.id, req.headers.get("user-agent"));
  return { ok: true };
});
