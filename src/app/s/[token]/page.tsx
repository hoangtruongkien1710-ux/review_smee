import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { shareState, touchShare } from "@/lib/share";
import { listAssets } from "@/lib/assets";
import { ShareGate } from "@/components/ShareGate";
import { AssetThumb } from "@/components/AssetThumb";
import { StatusPill } from "@/components/StatusPill";
import { Logo } from "@/components/ui";
import { LangPicker } from "@/components/I18n";
import { guestT } from "@/lib/i18n/server";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const st = await shareState(token);
  if (!st.ok) return <ShareGate token={token} reason={st.reason} name={st.share?.name} />;
  const share = st.share;
  const order = new Map(share.assets.map((a, i) => [a.assetId, i]));
  const assets = (await listAssets({ id: { in: share.assets.map((a) => a.assetId) }, deletedAt: null })).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
  if (assets.length === 1) redirect(`/s/${token}/${assets[0].id}`);
  await touchShare(share.id);
  const { t } = await guestT();

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
        {assets.length === 0 ? (
          <p className="mt-20 text-center text-sm text-mut">{t("Không còn file nào trong link này.")}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {assets.map((a) => (
              <Link key={a.id} href={`/s/${token}/${a.id}`} className="card overflow-hidden hover:border-line-2">
                <AssetThumb asset={a} fileBase={`/api/share/${token}/files`} />
                <div className="flex items-center gap-2 p-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
                  {a.version && <span className="text-xs text-dim">V{a.version.versionNo}</span>}
                </div>
                <div className="px-3 pb-3">
                  <StatusPill value={a.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
