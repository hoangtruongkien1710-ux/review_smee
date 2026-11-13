import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { listApprovals, recordApproval } from "@/lib/approvals";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const v = await prisma.version.findUnique({ where: { id }, include: { asset: true } });
  if (!v || v.asset.deletedAt) throw new HttpError(404, "Không tìm thấy phiên bản");
  return v;
}

export const GET = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const v = await load((await params).id);
  await requireProject(me, v.asset.projectId);
  return { approvals: await listApprovals([v.id]) };
});

const Body = z.object({ decision: z.enum(["APPROVED", "CHANGES"]), note: z.string().max(2000).optional() });

/** Duyệt / yêu cầu sửa (người có quyền comment trở lên). */
export const POST = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const v = await load((await params).id);
  await requireProject(me, v.asset.projectId, "COMMENTER");
  const b = await parse(req, Body);
  if (v.processingStatus !== "READY") throw new HttpError(400, "Phiên bản chưa xử lý xong");
  const approval = await recordApproval({ versionId: v.id, decision: b.decision, note: b.note, user: me });
  return { approval };
});
