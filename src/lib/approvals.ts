import "server-only";
import { prisma } from "./db";
import { notify } from "./comments";
import type { ApprovalDTO } from "./approval-dto";

const include = { user: { select: { name: true, color: true } } };
type Row = {
  id: string;
  versionId: string;
  decision: "APPROVED" | "CHANGES";
  note: string;
  guestName: string | null;
  createdAt: Date;
  user: { name: string; color: string } | null;
};

export function approvalDTO(a: Row): ApprovalDTO {
  return {
    id: a.id,
    versionId: a.versionId,
    decision: a.decision,
    note: a.note,
    name: a.user?.name ?? a.guestName ?? "Khách",
    color: a.user?.color ?? null,
    guest: !a.user,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Lịch sử duyệt của các phiên bản (mới nhất trước). */
export async function listApprovals(versionIds: string[]) {
  if (!versionIds.length) return [];
  const rows = await prisma.approval.findMany({ where: { versionId: { in: versionIds } }, include, orderBy: { createdAt: "desc" } });
  return rows.map(approvalDTO);
}

/**
 * Ghi quyết định duyệt / cần sửa. Nếu là bản hiện tại thì đổi trạng thái file
 * (Đã chốt / Khách yêu cầu sửa) và báo cho người phụ trách + người tạo file.
 */
export async function recordApproval(p: {
  versionId: string;
  decision: "APPROVED" | "CHANGES";
  note?: string;
  user?: { id: string; name: string; color: string; role: string } | null;
  guestName?: string | null;
  shareLinkId?: string | null;
}) {
  const v = await prisma.version.findUniqueOrThrow({ where: { id: p.versionId }, include: { asset: true } });
  const row = await prisma.approval.create({
    data: {
      assetId: v.assetId,
      versionId: v.id,
      userId: p.user?.id ?? null,
      guestName: p.user ? null : (p.guestName ?? "Khách"),
      shareLinkId: p.shareLinkId ?? null,
      decision: p.decision,
      note: p.note?.trim().slice(0, 2000) ?? "",
    },
    include,
  });
  if (v.asset.currentVersionId === v.id) {
    await prisma.asset.update({
      where: { id: v.assetId },
      data: { status: p.decision === "APPROVED" ? "approved" : "changes_requested" },
    });
  }
  const who = p.user ? { id: p.user.id, name: p.user.name, color: p.user.color } : { name: `${p.guestName ?? "Khách"} (khách)` };
  await notify(who, v.asset.projectId, [v.asset.assigneeId, v.asset.createdById, v.uploadedById], {
    text: `${p.decision === "APPROVED" ? "đã duyệt" : "yêu cầu sửa"} V${v.versionNo} “${v.asset.name}”`,
    excerpt: row.note || undefined,
    link: `/projects/${v.asset.projectId}/assets/${v.assetId}?v=${v.id}`,
  });
  return approvalDTO(row);
}
