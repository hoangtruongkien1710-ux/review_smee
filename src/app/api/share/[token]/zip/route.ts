import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { route } from "@/lib/api";
import { requireShare, shareScope } from "@/lib/share";
import { abs } from "@/lib/storage";
import * as drive from "@/lib/drive";
import { contentDisposition } from "@/lib/serve-file";
import { zipSafe, zipStream, type ZipEntry } from "@/lib/zip";

type Ctx = { params: Promise<{ token: string }> };

const MAX_FILES = 3000;

/** Khách tải cả thư mục (?f=) hoặc toàn bộ link thành một file .zip chứa file gốc. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { token } = await params;
  const share = await requireShare(token);
  if (!share.allowDownload) throw new HttpError(403, "Link này không cho tải file gốc");
  const scope = await shareScope(share);
  const f = new URL(req.url).searchParams.get("f");
  if (f && !scope.folders.has(f)) throw new HttpError(404, "Không tìm thấy thư mục");

  // các thư mục cần đóng gói + đường dẫn tương đối trong zip
  const dirs = new Map<string, string>();
  for (const id of scope.folders.keys()) {
    const p = scope.pathOf(id);
    const i = f ? p.findIndex((x) => x.id === f) : 0;
    if (i < 0) continue;
    dirs.set(id, p.slice(f ? i + 1 : 0).map((x) => zipSafe(x.name)).join("/"));
  }
  const or: Prisma.AssetWhereInput[] = [{ folderId: { in: [...dirs.keys()] } }];
  if (!f) or.push({ id: { in: [...scope.direct] } });
  const assets = await prisma.asset.findMany({
    where: { projectId: share.projectId, deletedAt: null, OR: or },
    include: { currentVersion: { select: { originalName: true, originalKey: true, driveFileId: true, createdAt: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: MAX_FILES,
  });

  const used = new Set<string>();
  const entries: ZipEntry[] = [];
  for (const a of assets) {
    const v = a.currentVersion;
    if (!v) continue;
    const ext = path.extname(v.originalName);
    let base = zipSafe(a.name);
    if (ext && !base.toLowerCase().endsWith(ext.toLowerCase())) base += ext;
    const dir = !f && scope.direct.has(a.id) ? "" : (a.folderId && dirs.get(a.folderId)) || "";
    let name = dir ? `${dir}/${base}` : base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const e = path.extname(base);
      name = `${dir ? dir + "/" : ""}${base.slice(0, base.length - e.length)} (${n})${e}`;
    }
    used.add(name.toLowerCase());
    entries.push({
      name,
      date: v.createdAt,
      open: async () => {
        if (v.originalKey && fs.existsSync(abs(v.originalKey))) return fs.createReadStream(abs(v.originalKey));
        if (v.driveFileId) {
          const r = await drive.download(v.driveFileId);
          if (r.ok && r.body) return Readable.fromWeb(r.body as import("node:stream/web").ReadableStream);
        }
        return null;
      },
    });
  }
  if (!entries.length) throw new HttpError(404, "Không có file nào để tải");
  // file lẻ trước, rồi theo thư mục
  entries.sort((a, b) => (a.name.includes("/") ? 1 : 0) - (b.name.includes("/") ? 1 : 0) || a.name.localeCompare(b.name, "vi"));

  const title = f ? scope.folders.get(f)!.name : share.name;
  return new Response(zipStream(entries), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition("attachment", `${zipSafe(title)}.zip`),
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});
