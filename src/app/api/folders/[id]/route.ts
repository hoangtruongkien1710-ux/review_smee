import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { sync } from "@/lib/drive-sync";
import { moveFolderToProject } from "@/lib/move";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const f = await prisma.folder.findUnique({ where: { id } });
  if (!f) throw new HttpError(404, "Không tìm thấy thư mục");
  return f;
}

const Body = z.object({
  name: z.string().trim().min(1, "Tên thư mục trống").max(120).optional(),
  parentId: z.string().nullable().optional(),
  /** Chuyển thư mục (kèm toàn bộ file bên trong) sang project khác; parentId là thư mục đích trong project đó */
  projectId: z.string().optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const f = await load(id);
  await requireProject(me, f.projectId, "EDITOR");
  const b = await parse(req, Body);
  if (b.projectId && b.projectId !== f.projectId) {
    await requireProject(me, b.projectId, "EDITOR");
    await moveFolderToProject(id, b.projectId, b.parentId ?? null);
    await prisma.project.updateMany({ where: { id: { in: [f.projectId, b.projectId] } }, data: { updatedAt: new Date() } });
    return { ok: true };
  }
  if (b.parentId !== undefined && b.parentId !== null) {
    // không cho chuyển thư mục vào chính nó hoặc thư mục con của nó
    let cur: string | null = b.parentId;
    while (cur) {
      if (cur === id) throw new HttpError(400, "Không thể chuyển thư mục vào chính nó");
      const p: { parentId: string | null; projectId: string } | null = await prisma.folder.findUnique({
        where: { id: cur },
        select: { parentId: true, projectId: true },
      });
      if (!p || p.projectId !== f.projectId) throw new HttpError(400, "Thư mục đích không hợp lệ");
      cur = p.parentId;
    }
  }
  await prisma.folder.update({ where: { id }, data: { name: b.name, parentId: b.parentId } });
  if (b.name && b.name !== f.name) sync.renameFolder(id, b.name);
  if (b.parentId !== undefined && b.parentId !== f.parentId) sync.moveFolder(id);
  return { ok: true };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const f = await load(id);
  await requireProject(me, f.projectId, "EDITOR");
  // Gom toàn bộ thư mục con, chuyển file bên trong vào thùng rác rồi xoá thư mục.
  const all = await prisma.folder.findMany({
    where: { projectId: f.projectId },
    select: { id: true, parentId: true, driveFolderId: true },
  });
  const ids = [id];
  for (let i = 0; i < ids.length; i++) for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
  const affected = await prisma.asset.findMany({ where: { folderId: { in: ids }, deletedAt: null }, select: { id: true } });
  await prisma.$transaction([
    prisma.asset.updateMany({
      where: { folderId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date(), folderId: null },
    }),
    prisma.folder.delete({ where: { id } }),
  ]);
  sync.deleteFolder(f.projectId, affected.map((a) => a.id), [f.driveFolderId]);
  return { ok: true };
});
