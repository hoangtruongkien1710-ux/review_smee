import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Download, Folder } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { shareScope, shareState, touchShare } from "@/lib/share";
import { listAssets } from "@/lib/assets";
import { ShareGate } from "@/components/ShareGate";
import { AssetThumb } from "@/components/AssetThumb";
import { StatusPill } from "@/components/StatusPill";
import { Logo } from "@/components/ui";
import { LangPicker } from "@/components/I18n";
import { guestT } from "@/lib/i18n/server";

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ f?: string }> }) {
  const { token } = await params;
  const { f } = await searchParams;
  const st = await shareState(token);
  if (!st.ok) return <ShareGate token={token} reason={st.reason} name={st.share?.name} />;
  const share = st.share;
  const scope = await shareScope(share);
  if (f && !scope.folders.has(f)) notFound();

  // Ở gốc: thư mục được chia sẻ + file chia sẻ lẻ. Trong thư mục: thư mục con + file của thư mục đó.
  const folders = f ? [...scope.folders.values()].filter((x) => x.parentId === f) : scope.roots;
  let assets;
  if (f) {
    assets = await listAssets({ projectId: share.projectId, folderId: f, deletedAt: null });
  } else {
    const order = new Map(share.assets.map((a, i) => [a.assetId, i]));
    const where: Prisma.AssetWhereInput = { id: { in: [...scope.direct] }, projectId: share.projectId, deletedAt: null };
    assets = (await listAssets(where)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  if (!f && !folders.length && assets.length === 1) redirect(`/s/${token}/${assets[0].id}`);
  await touchShare(share.id);
  const { t } = await guestT();
  const trail = f ? scope.pathOf(f) : [];
  const fileBase = `/api/share/${token}/files`;
  const zipHref = `/api/share/${token}/zip${f ? `?f=${f}` : ""}`;
  const empty = !folders.length && !assets.length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
        <Logo size={26} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{share.name}</div>
          <div className="truncate text-xs text-mut">{share.project.name}</div>
        </div>
        <LangPicker />
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        {(trail.length > 0 || (share.allowDownload && !empty)) && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm text-mut">
              {trail.length > 0 && (
                <>
                  <Link href={`/s/${token}`} className="hover:text-fg">
                    {share.name}
                  </Link>
                  {trail.map((x, i) => (
                    <span key={x.id} className="flex items-center gap-1">
                      <ChevronRight size={14} />
                      {i === trail.length - 1 ? (
                        <span className="font-medium text-fg">{x.name}</span>
                      ) : (
                        <Link href={`/s/${token}?f=${x.id}`} className="hover:text-fg">
                          {x.name}
                        </Link>
                      )}
                    </span>
                  ))}
                </>
              )}
            </nav>
            {share.allowDownload && !empty && (
              <a href={zipHref} className="btn-ghost h-8 border border-line" download>
                <Download size={15} /> {f || folders.length ? t("Tải cả thư mục (.zip)") : t("Tải tất cả (.zip)")}
              </a>
            )}
          </div>
        )}
        {empty ? (
          <p className="mt-20 text-center text-sm text-mut">{f ? t("Thư mục này đang trống.") : t("Không còn file nào trong link này.")}</p>
        ) : (
          <>
            {folders.length > 0 && (
              <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                {folders.map((x) => (
                  <div key={x.id} className="card flex items-center gap-3 p-3 hover:border-line-2">
                    <Link href={`/s/${token}?f=${x.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Folder size={20} className="shrink-0 text-accent" />
                      <span className="truncate text-sm font-medium">{x.name}</span>
                    </Link>
                    {share.allowDownload && (
                      <a href={`/api/share/${token}/zip?f=${x.id}`} className="btn-icon size-7" title={t("Tải thư mục (.zip)")} download>
                        <Download size={14} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {assets.map((a) => (
                <div key={a.id} className="card relative overflow-hidden hover:border-line-2">
                  <Link href={`/s/${token}/${a.id}`} className="block">
                    <AssetThumb asset={a} fileBase={fileBase} />
                    <div className="flex items-center gap-2 p-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
                      {a.version && <span className="text-xs text-dim">V{a.version.versionNo}</span>}
                    </div>
                  </Link>
                  <div className="flex items-center px-3 pb-3">
                    <StatusPill value={a.status} />
                    {share.allowDownload && a.version && (
                      <a href={`${fileBase}/${a.version.id}/original`} className="btn-icon ml-auto size-7" title={t("Tải file gốc")} download>
                        <Download size={14} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
