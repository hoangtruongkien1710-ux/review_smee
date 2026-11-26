import { z } from "zod";
import { removeVersionFiles } from "@/lib/files";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { sync } from "@/lib/drive-sync";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(1, "Tên project trống").max(120).optional(),
  description: z.string().max(1000).optional(),
  archived: z.boolean().optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await requireProject(me, id, "MANAGER");
  const b = await parse(req, Body);
  await prisma.project.update({ where: { id }, data: b });
  if (b.name) sync.renameProject(id, b.name);
  return { ok: true };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await requireProject(me, id, "MANAGER");
  // File gốc trên Drive được giữ lại (an toàn); bản xem trên Drive vào thùng rác Drive; file trên VPS xoá ngay.
  const versions = await prisma.version.findMany({
    where: { asset: { projectId: id } },
    select: { id: true, originalKey: true, proxyDriveId: true, lowDriveId: true },
  });
  await prisma.project.delete({ where: { id } });
  removeVersionFiles(versions);
  sync.deleteFiles(versions.flatMap((v) => [v.proxyDriveId, v.lowDriveId]));
  return { ok: true };
});
