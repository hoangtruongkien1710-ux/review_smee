import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, hashPassword, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { newShareToken, shareDTO, shareInclude } from "@/lib/share";

type Ctx = { params: Promise<{ id: string }> };

/** Các link chia sẻ của project. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await requireProject(me, id, "EDITOR");
  const rows = await prisma.shareLink.findMany({ where: { projectId: id }, include: shareInclude, orderBy: { createdAt: "desc" } });
  return { shares: rows.map(shareDTO) };
});

const Body = z.object({
  name: z.string().trim().min(1, "Đặt tên cho link").max(120),
  assetIds: z.array(z.string()).max(500).default([]),
  folderIds: z.array(z.string()).max(100).default([]),
  password: z.string().max(200).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  allowDownload: z.boolean().optional(),
  allowComment: z.boolean().optional(),
  allowApprove: z.boolean().optional(),
});

/** Tạo link chia sẻ cho file và/hoặc thư mục (thư mục gồm cả thư mục con, tự cập nhật khi thêm file). */
export const POST = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await requireProject(me, id, "EDITOR");
  const b = await parse(req, Body);
  const assets = await prisma.asset.findMany({ where: { id: { in: b.assetIds }, projectId: id, deletedAt: null }, select: { id: true } });
  const folders = await prisma.folder.findMany({ where: { id: { in: b.folderIds }, projectId: id }, select: { id: true } });
  if (!assets.length && !folders.length) throw new HttpError(400, "Chọn ít nhất 1 file hoặc thư mục");
  const order = new Map(b.assetIds.map((x, i) => [x, i]));
  const fOrder = new Map(b.folderIds.map((x, i) => [x, i]));
  const pw = b.password?.trim();
  const row = await prisma.shareLink.create({
    data: {
      token: newShareToken(),
      projectId: id,
      name: b.name,
      passwordHash: pw ? hashPassword(pw) : null,
      expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
      allowDownload: b.allowDownload ?? false,
      allowComment: b.allowComment ?? true,
      allowApprove: b.allowApprove ?? true,
      createdById: me.id,
      assets: { create: assets.map((a) => ({ assetId: a.id, sortOrder: order.get(a.id) ?? 0 })) },
      folders: { create: folders.map((f) => ({ folderId: f.id, sortOrder: fOrder.get(f.id) ?? 0 })) },
    },
    include: shareInclude,
  });
  return { share: shareDTO(row) };
});
