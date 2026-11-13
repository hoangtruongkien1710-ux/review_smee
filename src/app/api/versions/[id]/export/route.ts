import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { route } from "@/lib/api";
import { contentDisposition } from "@/lib/serve-file";
import { orderedComments, toPremiereXml, toResolveEdl, toXlsx } from "@/lib/export";

type Ctx = { params: Promise<{ id: string }> };

/** Tải danh sách comment: ?format=xlsx | premiere | resolve */
export const GET = route<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const v = await prisma.version.findUnique({ where: { id }, include: { asset: true } });
  if (!v || v.asset.deletedAt) throw new HttpError(404, "Không tìm thấy phiên bản");
  await requireProject(me, v.asset.projectId);
  const format = new URL(req.url).searchParams.get("format") ?? "xlsx";
  const comments = await orderedComments(me, v);
  const base = `${v.asset.name.replace(/\.[^.]+$/, "")} V${v.versionNo} - comment`;
  const send = (body: Buffer | string, ext: string, type: string) =>
    new Response(typeof body === "string" ? body : new Uint8Array(body), {
      headers: { "Content-Type": type, "Content-Disposition": contentDisposition("attachment", `${base}.${ext}`), "Cache-Control": "no-store" },
    });
  if (format === "xlsx")
    return send(toXlsx(v, v.asset.name, comments), "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  if (format === "premiere") return send(toPremiereXml(v, v.asset.name, comments), "xml", "application/xml; charset=utf-8");
  if (format === "resolve") return send(toResolveEdl(v, v.asset.name, comments), "edl", "text/plain; charset=utf-8");
  throw new HttpError(400, "Định dạng không hỗ trợ");
});
