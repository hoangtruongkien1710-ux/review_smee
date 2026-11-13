import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { requireShare, requireSharedAsset } from "@/lib/share";
import { listApprovals, recordApproval } from "@/lib/approvals";

type Ctx = { params: Promise<{ token: string; versionId: string }> };

async function load(token: string, versionId: string) {
  const share = await requireShare(token);
  const v = await prisma.version.findUnique({ where: { id: versionId } });
  if (!v) throw new HttpError(404, "Không tìm thấy phiên bản");
  const a = await requireSharedAsset(share, v.assetId);
  if (a.currentVersionId !== v.id) throw new HttpError(404, "Không tìm thấy phiên bản");
  return { share, v };
}

export const GET = route<Ctx>(async (_req, { params }) => {
  const { token, versionId } = await params;
  const { v } = await load(token, versionId);
  return { approvals: await listApprovals([v.id]) };
});

const Body = z.object({
  decision: z.enum(["APPROVED", "CHANGES"]),
  note: z.string().max(2000).optional(),
  guestName: z.string().trim().min(1, "Nhập tên của bạn").max(60),
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { token, versionId } = await params;
  const { share, v } = await load(token, versionId);
  if (!share.allowApprove) throw new HttpError(403, "Link này không cho duyệt");
  if (v.processingStatus !== "READY") throw new HttpError(400, "Phiên bản chưa xử lý xong");
  const b = await parse(req, Body);
  const approval = await recordApproval({ versionId: v.id, decision: b.decision, note: b.note, guestName: b.guestName, shareLinkId: share.id });
  return { approval };
});
