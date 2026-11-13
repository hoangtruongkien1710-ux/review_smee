"use client";

import { useState } from "react";
import { useT } from "./I18n";
import { FileText, FileAudio, FileImage, FileVideo, File as FileIcon, Loader2, AlertTriangle, FileSpreadsheet, Presentation } from "lucide-react";
import type { AssetDTO } from "@/lib/asset-dto";
import { extOf } from "@/lib/kinds";

export function formatDuration(sec: number | null | undefined) {
  if (!sec && sec !== 0) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function KindIcon({ asset, size = 28 }: { asset: Pick<AssetDTO, "kind" | "name">; size?: number }) {
  const ext = extOf(asset.name);
  if (asset.kind === "VIDEO") return <FileVideo size={size} />;
  if (asset.kind === "AUDIO") return <FileAudio size={size} />;
  if (asset.kind === "IMAGE") return <FileImage size={size} />;
  if (["xls", "xlsx", "ods", "csv", "numbers"].includes(ext)) return <FileSpreadsheet size={size} />;
  if (["ppt", "pptx", "odp", "key"].includes(ext)) return <Presentation size={size} />;
  if (asset.kind === "PDF" || asset.kind === "DOCUMENT") return <FileText size={size} />;
  return <FileIcon size={size} />;
}

/** Ảnh đại diện của file; video có rê chuột để xem nhanh (scrub). */
export function AssetThumb({ asset, onRetry, fileBase = "/api/files" }: { asset: AssetDTO; onRetry?: () => void; fileBase?: string }) {
  const v = asset.version;
  const [scrub, setScrub] = useState<number | null>(null);
  const t = useT();
  const canScrub = !!(v?.spriteCols && v.spriteCount && v.status === "READY");
  const aspect = v?.width && v?.height ? v.width / v.height : 16 / 9;

  return (
    <div
      className="relative flex aspect-video items-center justify-center overflow-hidden bg-[#08090b] text-dim"
      onMouseMove={(e) => {
        if (!canScrub) return;
        const r = e.currentTarget.getBoundingClientRect();
        setScrub(Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      onMouseLeave={() => setScrub(null)}
    >
      {v?.hasThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${fileBase}/${v.id}/thumb`} alt="" className="h-full w-full object-contain" loading="lazy" draggable={false} />
      ) : (
        <KindIcon asset={asset} size={34} />
      )}
      {canScrub && scrub !== null && (() => {
        const cols = v!.spriteCols!;
        const rows = 10;
        const idx = Math.floor(scrub * v!.spriteCount!);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        return (
          <>
            <div className="absolute inset-0 flex items-center justify-center bg-[#08090b]">
              <div
                className="h-full max-w-full"
                style={{
                  aspectRatio: String(aspect),
                  backgroundImage: `url(${fileBase}/${v!.id}/sprite)`,
                  backgroundSize: `${cols * 100}% ${rows * 100}%`,
                  backgroundPosition: `${(col / (cols - 1)) * 100}% ${(row / (rows - 1)) * 100}%`,
                }}
              />
            </div>
            <div className="absolute bottom-0 left-0 h-0.5 bg-accent" style={{ width: `${scrub * 100}%` }} />
          </>
        );
      })()}
      {v && (v.status === "QUEUED" || v.status === "PROCESSING" || v.status === "UPLOADING") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-xs text-fg">
          <Loader2 size={20} className="animate-spin text-accent" />
          {v.status === "PROCESSING" ? t("Đang xử lý {p}%", { p: v.progress }) : t("Chờ xử lý…")}
        </div>
      )}
      {v?.status === "FAILED" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 p-3 text-center text-xs">
          <AlertTriangle size={18} className="text-err" />
          <span className="line-clamp-2 text-[#ffb4c0]" title={v.error ?? ""}>
            {t("Xử lý lỗi")}
          </span>
          {onRetry && (
            <button
              className="rounded-md bg-panel-2 px-2 py-1 text-fg hover:bg-line-2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRetry();
              }}
            >
              {t("Thử lại")}
            </button>
          )}
        </div>
      )}
      {v?.durationSec ? (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
          {formatDuration(v.durationSec)}
        </span>
      ) : null}
      {asset.versionCount > 1 && (
        <span className="absolute left-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white">V{v?.versionNo}</span>
      )}
    </div>
  );
}
