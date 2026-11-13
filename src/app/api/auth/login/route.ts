import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, createSession, verifyPassword } from "@/lib/auth";

const Body = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

// Chống dò mật khẩu đơn giản: tối đa 10 lần sai / 15 phút cho mỗi email.
const fails = new Map<string, { n: number; until: number }>();

export const POST = route(async (req) => {
  const b = await parse(req, Body);
  const f = fails.get(b.email);
  if (f && f.n >= 10 && f.until > Date.now()) throw new HttpError(429, "Sai quá nhiều lần, thử lại sau 15 phút");
  const user = await prisma.user.findUnique({ where: { email: b.email } });
  if (!user || !verifyPassword(b.password, user.passwordHash)) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + 15 * 60_000 };
    fails.set(b.email, { n: cur.n + 1, until: cur.until });
    throw new HttpError(401, "Sai tên đăng nhập hoặc mật khẩu");
  }
  if (user.status !== "ACTIVE") throw new HttpError(403, "Tài khoản đã bị khoá");
  fails.delete(b.email);
  await createSession(user.id, req.headers.get("user-agent"));
  return { ok: true };
});
