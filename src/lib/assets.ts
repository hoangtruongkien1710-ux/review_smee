import "server-only";
import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import type { AssetDTO, VersionDTO } from "./asset-dto";

const include = {
  currentVersion: { include: { uploadedBy: { select: { name: true } } } },
  assignee: { select: { name: true } },
  createdBy: { select: { name: true } },
  _count: { select: { versions: true, comments: true } },
} satisfies Prisma.AssetInclude;

type Row = Prisma.AssetGetPayload<{ include: typeof include }>;
type VRow = Prisma.VersionGetPayload<{ include: { uploadedBy: { select: { name: true } } } }>;

export function versionDTO(v: VRow): VersionDTO {
  return {
    id: v.id,
    versionNo: v.versionNo,
    originalName: v.originalName,
    mimeType: v.mimeType,
    kind: v.kind,
    size: Number(v.size),
    durationSec: v.durationSec,
    fps: v.fps,
    width: v.width,
    height: v.height,
    pageCount: v.pageCount,
    status: v.processingStatus,
    progress: v.progress,
    error: v.processingError,
    hasProxy: !!v.proxyKey,
    purged: !!v.previewPurgedAt && !v.proxyKey,
    hasThumb: !!v.thumbKey,
    spriteCols: v.spriteKey ? v.spriteCols : null,
    spriteCount: v.spriteKey ? v.spriteCount : null,
    hasWaveform: !!v.waveformKey,
    hasPages: !!v.pagesKey,
    onDrive: !!v.driveFileId,
    uploadedBy: v.uploadedBy?.name ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

export function assetDTO(a: Row): AssetDTO {
  return {
    id: a.id,
    projectId: a.projectId,
    folderId: a.folderId,
    name: a.name,
    kind: a.kind,
    status: a.status,
    assigneeId: a.assigneeId,
    assigneeName: a.assignee?.name ?? null,
    createdBy: a.createdBy?.name ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt?.toISOString() ?? null,
    versionCount: a._count.versions,
    commentCount: a._count.comments,
    version: a.currentVersion ? versionDTO(a.currentVersion) : null,
  };
}

export async function listAssets(where: Prisma.AssetWhereInput) {
  const rows = await prisma.asset.findMany({ where, include, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  return rows.map(assetDTO);
}

export async function getAsset(id: string) {
  const a = await prisma.asset.findUnique({ where: { id }, include });
  return a ? assetDTO(a) : null;
}
