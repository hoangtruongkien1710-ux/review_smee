import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, hashPassword, requireUser, verifyPassword } from "@/lib/auth";

const Body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Mật khẩu mới cần ít nhất 8 ký tự").max(200).optional(),
});

export const PATCH = route(async (req) => {
  const me = await requireUser();
  const b = await parse(req, Body);
  const data: { name?: string; color?: string; passwordHash?: string } = {};
  if (b.name) data.name = b.name;
  if (b.color) data.color = b.color;
  if (b.newPassword) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!verifyPassword(b.currentPassword ?? "", u.passwordHash)) throw new HttpError(400, "Mật khẩu hiện tại không đúng");
    data.passwordHash = hashPassword(b.newPassword);
  }
  await prisma.user.update({ where: { id: me.id }, data });
  return { ok: true };
});
