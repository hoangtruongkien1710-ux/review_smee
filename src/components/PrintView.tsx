"use client";

// Bản in danh sách comment: mỗi comment kèm hình khung hình / trang và nét vẽ.
import { useEffect } from "react";
import { Printer } from "lucide-react";
import type { CommentDTO } from "@/lib/comment-dto";
import { plainText } from "@/lib/comment-dto";
import { DEFAULT_FPS, formatTime } from "@/lib/timecode";
import { ShapeEl } from "./review/Stage";

type V = {
  id: string;
  versionNo: number;
  kind: string;
  fps: number | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasSprite: boolean;
  spriteCols: number | null;
  spriteCount: number | null;
  hasPages: boolean;
  hasProxy: boolean;
};

const TW = 220; // chiều rộng ảnh minh hoạ (px)
const who = (c: CommentDTO) => c.author?.name ?? (c.guestName ? `${c.guestName} (khách)` : "Khách");

function Thumb({ v, c }: { v: V; c: CommentDTO }) {
  const aspect = v.width && v.height ? v.width / v.height : v.kind === "VIDEO" ? 16 / 9 : 1 / 1.414;
  const h = Math.round(TW / aspect);
  let bg: React.CSSProperties | null = null;
  let img: string | null = null;
  if (v.kind === "VIDEO" && c.timeStart != null && v.hasSprite && v.spriteCols && v.spriteCount && v.durationSec) {
    const cols = v.spriteCols;
    const rows = 10;
    const idx = Math.min(v.spriteCount - 1, Math.floor((c.timeStart / v.durationSec) * v.spriteCount));
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    bg = {
      backgroundImage: `url(/api/files/${v.id}/sprite)`,
      backgroundSize: `${cols * 100}% ${rows * 100}%`,
      backgroundPosition: `${(col / (cols - 1)) * 100}% ${(row / (rows - 1)) * 100}%`,
    };
  } else if (v.kind === "IMAGE" && v.hasProxy) img = `/api/files/${v.id}/proxy`;
  else if (v.hasPages && c.page) img = `/api/files/${v.id}/page?n=${c.page}`;
  if (!bg && !img) return null;
  return (
    <div className="relative shrink-0 overflow-hidden rounded border border-neutral-300 bg-black" style={{ width: TW, height: h }}>
      {bg && <div className="absolute inset-0" style={bg} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && <img src={img} alt="" className="absolute inset-0 h-full w-full bg-white object-contain" />}
      {(c.annotation?.shapes?.length || c.pinX != null) && (
        <svg className="absolute inset-0" width={TW} height={h}>
          {c.annotation?.shapes.map((s, i) => <ShapeEl key={i} s={s} w={TW} h={h} />)}
          {c.pinX != null && c.pinY != null && <circle cx={c.pinX * TW} cy={c.pinY * h} r={7} fill="#FF6B4A" stroke="#fff" strokeWidth={2} />}
        </svg>
      )}
    </div>
  );
}

export function PrintView({
  project,
  asset,
  version: v,
  comments,
  printedBy,
}: {
  project: string;
  asset: string;
  version: V;
  comments: CommentDTO[];
  printedBy: string;
}) {
  const fps = v.fps && v.fps > 0 ? v.fps : DEFAULT_FPS;
  useEffect(() => {
    document.title = `${asset} V${v.versionNo} - comment`;
    // đợi ảnh tải xong rồi mở hộp thoại in
    const imgs = Array.from(document.images);
    Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => ((i.onload = r), (i.onerror = r)))))).then(() =>
      setTimeout(() => window.print(), 400),
    );
  }, [asset, v.versionNo]);
  const open = comments.filter((c) => !c.resolved).length;

  return (
    <div className="h-dvh overflow-y-auto bg-white text-neutral-900 print:h-auto print:overflow-visible">
      <style>{`* { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @media print { @page { margin: 14mm; } body { background: #fff !important; } }`}</style>
      <div className="mx-auto max-w-4xl p-8 print:p-0">
        <div className="mb-6 flex items-start gap-4 border-b border-neutral-300 pb-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{project}</div>
            <h1 className="text-xl font-semibold">
              {asset} <span className="text-neutral-500">· V{v.versionNo}</span>
            </h1>
            <div className="mt-1 text-sm text-neutral-600">
              {comments.length} comment ({open} chưa xong) · In bởi {printedBy} lúc {new Date().toLocaleString("vi-VN")}
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white print:hidden"
          >
            <Printer size={15} /> In / Lưu PDF
          </button>
        </div>
        {comments.length === 0 && <p className="text-neutral-500">Chưa có comment nào.</p>}
        <ol className="space-y-4">
          {comments.map((c, i) => (
            <li key={c.id} className="flex gap-4 border-b border-neutral-200 pb-4" style={{ breakInside: "avoid" }}>
              <div className="w-8 shrink-0 pt-0.5 text-right font-mono text-sm font-semibold text-neutral-500">#{i + 1}</div>
              <Thumb v={v} c={c} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {c.timeStart != null && (
                    <span className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-xs font-semibold text-white">
                      {formatTime(c.timeStart, fps)}
                      {c.timeEnd != null && ` → ${formatTime(c.timeEnd, fps)}`}
                    </span>
                  )}
                  {c.page != null && <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-semibold">Trang {c.page}</span>}
                  <b>{who(c)}</b>
                  <span className="text-xs text-neutral-500">{new Date(c.createdAt).toLocaleString("vi-VN")}</span>
                  <span className={c.resolved ? "text-xs font-medium text-green-700" : "text-xs font-medium text-red-600"}>
                    {c.resolved ? "✓ Đã xong" : "○ Chưa xong"}
                  </span>
                  {c.internal && <span className="text-xs font-medium text-amber-600">Nội bộ</span>}
                  {c.fromVersionNo && <span className="text-xs text-neutral-500">Từ V{c.fromVersionNo}</span>}
                </div>
                <p className="whitespace-pre-wrap break-words">{plainText(c.body)}</p>
                {c.replies.length > 0 && (
                  <div className="mt-2 space-y-1 border-l-2 border-neutral-200 pl-3">
                    {c.replies.map((r) => (
                      <p key={r.id} className="whitespace-pre-wrap break-words text-neutral-700">
                        <b>{who(r)}:</b> {plainText(r.body)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
