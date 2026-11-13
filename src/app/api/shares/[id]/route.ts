import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, hashPassword, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { shareDTO, shareInclude } from "@/lib/share";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const me = await requireUser();
  const s = await prisma.shareLink.findUnique({ where: { id } });
  if (!s) throw new HttpError(404, "Không tìm thấy link");
  await requireProject(me, s.projectId, "EDITOR");
  return s;
}

const Patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().max(200).nullable().optional(), // null = bỏ mật khẩu
  expiresAt: z.string().datetime().nullable().optional(),
  allowDownload: z.boolean().optional(),
  allowComment: z.boolean().optional(),
  allowApprove: z.boolean().optional(),
  disabled: z.boolean().optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const s = await load((await params).id);
  const b = await parse(req, Patch);
  const { password, expiresAt, ...rest } = b;
  const row = await prisma.shareLink.update({
    where: { id: s.id },
    data: {
      ...rest,
      ...(password !== undefined ? { passwordHash: password?.trim() ? hashPassword(password.trim()) : null } : {}),
      ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
    },
    include: shareInclude,
  });
  return { share: shareDTO(row) };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const s = await load((await params).id);
  await prisma.shareLink.delete({ where: { id: s.id } });
  return { ok: true };
});
