"use client";

// So sánh 2 phiên bản: cạnh nhau hoặc trượt (wipe), video phát và tua đồng bộ.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Columns2, SplitSquareHorizontal, Volume2 } from "lucide-react";
import type { AssetDTO, VersionDTO } from "@/lib/asset-dto";
import { cn, timeAgo } from "@/lib/utils";
import { DEFAULT_FPS, type TcMode } from "@/lib/timecode";
import { FitBox } from "./Stage";
import { useMedia, useTransport, Timeline, Transport } from "./Player";

type View = "video" | "image" | "pages" | "other";
const viewOf = (v: VersionDTO | undefined): View =>
  !v || v.status !== "READY" || !v.hasProxy
    ? "other"
    : v.kind === "VIDEO"
      ? "video"
      : v.kind === "IMAGE"
        ? "image"
        : v.hasPages
          ? "pages"
          : "other";

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
};

export function CompareView({
  project,
  asset,
  versions,
  initialA,
  initialB,
}: {
  project: { id: string; name: string };
  asset: AssetDTO;
  versions: VersionDTO[];
  initialA: string;
  initialB: string;
}) {
  const [aId, setAId] = useState(initialA);
  const [bId, setBId] = useState(initialB);
  const A = versions.find((v) => v.id === aId)!;
  const B = versions.find((v) => v.id === bId)!;
  const view = viewOf(A) === viewOf(B) ? viewOf(A) : "other";
  const [mode, setMode] = useState<"side" | "wipe">("side");
  const [wipe, setWipe] = useState(0.5);
  const [audioFrom, setAudioFrom] = useState<"a" | "b">("b");
  const [page, setPage] = useState(1);
  const pages = Math.min(Math.max(A?.pageCount ?? 1, B?.pageCount ?? 1), 300);

  // giữ link khớp lựa chọn (để gửi cho người khác)
  useEffect(() => {
    const u = new URL(location.href);
    u.searchParams.set("a", aId);
    u.searchParams.set("b", bId);
    history.replaceState(null, "", u);
  }, [aId, bId]);

  /* ---------- video đồng bộ: bên trái điều khiển, bên phải chạy theo ---------- */
  const [elA, setElA] = useState<HTMLVideoElement | null>(null);
  const [elB, setElB] = useState<HTMLVideoElement | null>(null);
  const fps = A?.fps && A.fps > 0 ? A.fps : DEFAULT_FPS;
  const s = useMedia(elA, Math.max(A?.durationSec ?? 0, B?.durationSec ?? 0) || null);
  const tr = useTransport(elA, fps);
  const [tcMode, setTcMode] = useState<TcMode>("tc");
  const [loop, setLoop] = useState(false);
  const [inPt, setInPt] = useState<number | null>(null);
  // nhớ vị trí khi đổi chế độ xem / đổi phiên bản (thẻ video được tạo lại)
  const lastT = useRef(0);
  useEffect(() => {
    if (s.t > 0) lastT.current = s.t;
  }, [s.t]);
  const [outPt, setOutPt] = useState<number | null>(null);

  useEffect(() => {
    if (!elA || !elB) return;
    const sync = () => {
      if (Math.abs(elB.currentTime - elA.currentTime) > 0.5 / fps) elB.currentTime = Math.min(elA.currentTime, elB.duration || elA.currentTime);
    };
    const play = () => {
      sync();
      void elB.play().catch(() => {});
    };
    const pause = () => {
      elB.pause();
      sync();
    };
    const rate = () => (elB.playbackRate = elA.playbackRate);
    elA.addEventListener("play", play);
    elA.addEventListener("pause", pause);
    elA.addEventListener("seeked", sync);
    elA.addEventListener("ratechange", rate);
    // khi đang phát: chỉnh lại nếu lệch quá 0,15 giây
    const t = setInterval(() => {
      if (!elA.paused && Math.abs(elB.currentTime - elA.currentTime) > 0.15) elB.currentTime = elA.currentTime;
    }, 500);
    return () => {
      elA.removeEventListener("play", play);
      elA.removeEventListener("pause", pause);
      elA.removeEventListener("seeked", sync);
      elA.removeEventListener("ratechange", rate);
      clearInterval(t);
    };
  }, [elA, elB, fps]);
  useEffect(() => {
    if (elA) elA.muted = audioFrom !== "a";
    if (elB) elB.muted = audioFrom !== "b";
  }, [elA, elB, audioFrom]);
  useEffect(() => {
    if (elA) elA.loop = loop && inPt == null && outPt == null;
  }, [elA, loop, inPt, outPt]);
  useEffect(() => {
    if (!elA || !s.playing || outPt == null || s.t < outPt) return;
    if (loop) tr.seek(inPt ?? 0);
    else {
      elA.pause();
      tr.seek(outPt);
    }
  }, [s.t, s.playing, elA, loop, inPt, outPt, tr]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (view === "pages") {
        if (k === "arrowleft") setPage((p) => Math.max(1, p - 1));
        else if (k === "arrowright") setPage((p) => Math.min(pages, p + 1));
        else return;
        e.preventDefault();
        return;
      }
      if (view !== "video") return;
      const map: Record<string, () => void> = {
        " ": tr.toggle,
        k: tr.pause,
        j: tr.backward,
        l: tr.forward,
        arrowleft: () => tr.step(e.shiftKey ? -Math.round(fps) : -1),
        arrowright: () => tr.step(e.shiftKey ? Math.round(fps) : 1),
        i: () => setInPt(s.t),
        o: () => setOutPt(s.t),
        x: () => (setInPt(null), setOutPt(null)),
      };
      if (map[k]) {
        e.preventDefault();
        map[k]();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [view, tr, fps, s.t, pages]);

  /* ---------- hiển thị ---------- */
  const aspectOf = (v: VersionDTO) => (v.width && v.height ? v.width / v.height : view === "pages" ? 1 / 1.414 : 16 / 9);
  const srcOf = (v: VersionDTO) => (view === "pages" ? `/api/files/${v.id}/page?n=${Math.min(page, v.pageCount ?? 1)}` : `/api/files/${v.id}/proxy`);

  const media = (v: VersionDTO, side: "a" | "b", extra?: string) =>
    view === "video" ? (
      <video
        key={v.id}
        ref={side === "a" ? setElA : setElB}
        src={srcOf(v)}
        preload="auto"
        playsInline
        onLoadedMetadata={(e) => {
          if (lastT.current > 0) e.currentTarget.currentTime = Math.min(lastT.current, e.currentTarget.duration || lastT.current);
        }}
        onClick={mode === "side" ? tr.toggle : undefined}
        className={cn("absolute inset-0 h-full w-full bg-black", extra)}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={v.id + page} src={srcOf(v)} alt={`V${v.versionNo}`} draggable={false} className={cn("absolute inset-0 h-full w-full select-none object-contain", view === "pages" && "bg-white", extra)} />
    );

  const picker = (side: "a" | "b") => {
    const cur = side === "a" ? A : B;
    return (
      <select
        value={cur.id}
        onChange={(e) => (side === "a" ? setAId : setBId)(e.target.value)}
        className="input h-7 w-auto rounded-md py-0 text-xs font-semibold"
        aria-label={side === "a" ? "Phiên bản trái" : "Phiên bản phải"}
      >
        {versions.map((x) => (
          <option key={x.id} value={x.id}>
            V{x.versionNo} · {x.uploadedBy ?? "?"} · {timeAgo(x.createdAt)}
          </option>
        ))}
      </select>
    );
  };

  const dragWipe = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setWipe(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-mut">
          <Link href={`/projects/${project.id}`} className="truncate hover:text-fg">
            {project.name}
          </Link>
          <ChevronRight size={14} className="shrink-0" />
          <Link href={`/projects/${project.id}/assets/${asset.id}?v=${B.id}`} className="truncate hover:text-fg">
            {asset.name}
          </Link>
          <ChevronRight size={14} className="shrink-0" />
          <span className="shrink-0 font-medium text-fg">So sánh</span>
        </nav>
        <div className="flex rounded-lg border border-line-2 p-0.5">
          <button onClick={() => setMode("side")} className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs", mode === "side" ? "bg-panel-2 text-fg" : "text-mut")}>
            <Columns2 size={14} /> Cạnh nhau
          </button>
          <button onClick={() => setMode("wipe")} className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs", mode === "wipe" ? "bg-panel-2 text-fg" : "text-mut")}>
            <SplitSquareHorizontal size={14} /> Trượt
          </button>
        </div>
        <Link className="btn-outline h-8" href={`/projects/${project.id}/assets/${asset.id}?v=${B.id}`}>
          Đóng so sánh
        </Link>
      </header>

      {versions.length < 2 ? (
        <p className="m-auto text-sm text-mut">File này mới có 1 phiên bản.</p>
      ) : view === "other" ? (
        <div className="m-auto max-w-md text-center text-sm text-mut">
          {A.status !== "READY" || B.status !== "READY"
            ? "Một trong hai phiên bản đang xử lý hoặc bị lỗi, đợi xử lý xong rồi so sánh."
            : "Loại file này chưa so sánh cạnh nhau được (chỉ hỗ trợ video, ảnh, PDF/Word)."}
          <div className="mt-3 flex justify-center gap-2">
            {picker("a")}
            {picker("b")}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col bg-[#08090b]">
          {mode === "side" ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-line">
              {([["a", A], ["b", B]] as const).map(([side, v]) => (
                <div key={side} className="relative flex min-h-0 flex-col bg-[#08090b]">
                  <div className="flex items-center gap-2 px-3 pt-2">
                    {picker(side)}
                    {view === "video" && (
                      <button
                        onClick={() => setAudioFrom(side)}
                        title="Nghe âm thanh bên này"
                        className={cn("flex h-7 items-center gap-1 rounded-md px-2 text-xs", audioFrom === side ? "bg-accent/15 text-accent" : "text-dim hover:text-fg")}
                      >
                        <Volume2 size={13} /> {audioFrom === side ? "Đang nghe" : "Nghe"}
                      </button>
                    )}
                  </div>
                  <FitBox aspect={aspectOf(v)} className="p-3">
                    {() => media(v, side)}
                  </FitBox>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between px-3 pt-2">
                <div className="flex items-center gap-2">
                  {picker("a")} <span className="text-xs text-dim">← trái</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dim">phải →</span> {picker("b")}
                </div>
              </div>
              <FitBox aspect={aspectOf(A)} className="p-3">
                {() => (
                  <div
                    className="absolute inset-0 cursor-ew-resize touch-none"
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragWipe(e);
                    }}
                    onPointerMove={(e) => e.buttons === 1 && dragWipe(e)}
                  >
                    {media(A, "a")}
                    <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${wipe * 100}%)` }}>
                      {media(B, "b")}
                    </div>
                    <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow" style={{ left: `${wipe * 100}%` }}>
                      <span className="absolute left-1/2 top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#0e0f12] shadow-lg">
                        ⇆
                      </span>
                    </div>
                    <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-semibold">V{A.versionNo}</span>
                    <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-semibold">V{B.versionNo}</span>
                  </div>
                )}
              </FitBox>
            </div>
          )}

          {view === "video" && (
            <div className="shrink-0 border-t border-line bg-panel px-3 pb-2 pt-1">
              <Timeline
                duration={s.duration}
                t={s.t}
                buffered={s.buffered}
                fps={fps}
                mode={tcMode}
                onSeek={tr.seek}
                onScrubStart={tr.scrubStart}
                onScrubEnd={tr.scrubEnd}
                markers={[]}
                onMarker={() => {}}
                inPt={inPt}
                outPt={outPt}
              />
              <Transport
                el={elA}
                s={s}
                fps={fps}
                mode={tcMode}
                setMode={setTcMode}
                tr={tr}
                loop={loop}
                setLoop={setLoop}
                inPt={inPt}
                outPt={outPt}
                setIn={() => setInPt(s.t)}
                setOut={() => setOutPt(s.t)}
                clearInOut={() => (setInPt(null), setOutPt(null))}
                fullscreen={false}
              />
            </div>
          )}
          {view === "pages" && (
            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-line bg-panel px-3 py-2 text-sm">
              <button className="btn-icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Trang trước">
                <ChevronLeft size={16} />
              </button>
              <span className="tabular-nums text-mut">
                Trang {page} / {pages}
              </span>
              <button className="btn-icon" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Trang sau">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
