"use client";

// Điều khiển trình phát: trạng thái media, timeline có đánh dấu comment, hàng nút điều khiển.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  StepBack,
  StepForward,
  Repeat,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, frameOf, type TcMode, TC_LABEL } from "@/lib/timecode";
import { Menu, MenuItem } from "../ui";
import { useT } from "../I18n";

export type MediaState = {
  t: number;
  duration: number;
  playing: boolean;
  rate: number;
  volume: number;
  muted: boolean;
  buffered: number;
};

/** Theo dõi trạng thái thẻ <video>/<audio>; cập nhật thời gian mượt theo từng khung hình. */
export function useMedia(el: HTMLMediaElement | null, fallbackDuration: number | null) {
  const [s, setS] = useState<MediaState>({ t: 0, duration: fallbackDuration ?? 0, playing: false, rate: 1, volume: 1, muted: false, buffered: 0 });
  useEffect(() => {
    if (!el) return;
    let raf = 0;
    const read = () =>
      setS({
        t: el.currentTime,
        duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : (fallbackDuration ?? 0),
        playing: !el.paused && !el.ended,
        rate: el.playbackRate,
        volume: el.volume,
        muted: el.muted,
        buffered: el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0,
      });
    const tick = () => {
      read();
      if (!el.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const evs = ["loadedmetadata", "durationchange", "pause", "seeked", "timeupdate", "ratechange", "volumechange", "progress", "ended"];
    evs.forEach((e) => el.addEventListener(e, read));
    el.addEventListener("play", onPlay);
    read();
    return () => {
      cancelAnimationFrame(raf);
      evs.forEach((e) => el.removeEventListener(e, read));
      el.removeEventListener("play", onPlay);
    };
  }, [el, fallbackDuration]);
  return s;
}

/** Các thao tác trên media: tua đúng khung hình, J/K/L, vòng lặp đoạn In/Out. */
export function useTransport(el: HTMLMediaElement | null, fps: number) {
  const shuttle = useRef<{ dir: number; speed: number; raf: number; last: number } | null>(null);

  const stopShuttle = useCallback(() => {
    if (shuttle.current) cancelAnimationFrame(shuttle.current.raf);
    shuttle.current = null;
  }, []);

  const seek = useCallback(
    (t: number) => {
      if (!el) return;
      const d = Number.isFinite(el.duration) ? el.duration : t;
      el.currentTime = Math.min(Math.max(0, t), Math.max(0, d - 0.001));
    },
    [el],
  );
  /** Đặt vào giữa khung hình thứ n để trình duyệt hiển thị đúng khung đó. */
  const seekFrame = useCallback((n: number) => seek((Math.max(0, n) + 0.25) / fps), [seek, fps]);
  const step = useCallback(
    (frames: number) => {
      if (!el) return;
      stopShuttle();
      el.pause();
      seekFrame(frameOf(el.currentTime, fps) + frames);
    },
    [el, fps, seekFrame, stopShuttle],
  );
  const toggle = useCallback(() => {
    if (!el) return;
    stopShuttle();
    if (el.paused) {
      el.playbackRate = el.playbackRate < 0.25 ? 1 : el.playbackRate;
      void el.play().catch(() => {});
    } else el.pause();
  }, [el, stopShuttle]);
  const pause = useCallback(() => {
    stopShuttle();
    el?.pause();
  }, [el, stopShuttle]);

  // Kéo thanh thời gian: tạm dừng trong lúc kéo, thả ra thì phát tiếp nếu trước đó đang phát.
  const resumeAfterScrub = useRef(false);
  const scrubStart = useCallback(() => {
    if (!el) return;
    stopShuttle();
    resumeAfterScrub.current = !el.paused && !el.ended;
    el.pause();
  }, [el, stopShuttle]);
  const scrubEnd = useCallback(() => {
    if (!el || !resumeAfterScrub.current) return;
    resumeAfterScrub.current = false;
    void el.play().catch(() => {});
  }, [el]);

  // L: phát tới, bấm thêm để nhanh 2x, 4x. J: lùi (tua ngược mô phỏng), bấm thêm để nhanh hơn. K: dừng.
  const forward = useCallback(() => {
    if (!el) return;
    if (shuttle.current) stopShuttle();
    if (!el.paused && el.playbackRate >= 1) el.playbackRate = Math.min(8, el.playbackRate * 2);
    else {
      el.playbackRate = 1;
      void el.play().catch(() => {});
    }
  }, [el, stopShuttle]);
  const backward = useCallback(() => {
    if (!el) return;
    el.pause();
    if (shuttle.current) {
      shuttle.current.speed = Math.min(8, shuttle.current.speed * 2);
      return;
    }
    const sh = { dir: -1, speed: 1, raf: 0, last: performance.now() };
    shuttle.current = sh;
    const loop = (now: number) => {
      if (shuttle.current !== sh) return;
      const dt = (now - sh.last) / 1000;
      sh.last = now;
      const nt = el.currentTime - dt * sh.speed;
      if (nt <= 0) {
        el.currentTime = 0;
        stopShuttle();
        return;
      }
      if (!el.seeking) el.currentTime = nt;
      sh.raf = requestAnimationFrame(loop);
    };
    sh.raf = requestAnimationFrame(loop);
  }, [el, stopShuttle]);

  useEffect(() => stopShuttle, [stopShuttle]);
  return { seek, seekFrame, step, toggle, pause, forward, backward, stopShuttle, scrubStart, scrubEnd };
}

export type Marker = {
  id: string;
  start: number;
  end: number | null;
  color: string;
  label: string;
  resolved: boolean;
  active: boolean;
};

/** Thanh thời gian: kéo để tua, rê chuột xem trước khung hình, chấm comment, vùng In/Out. */
export function Timeline({
  duration,
  t,
  buffered,
  fps,
  mode,
  onSeek,
  onScrubStart,
  onScrubEnd,
  markers,
  onMarker,
  inPt,
  outPt,
  sprite,
  waveform,
  tall,
}: {
  duration: number;
  t: number;
  buffered: number;
  fps: number;
  mode: TcMode;
  onSeek: (t: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  markers: Marker[];
  onMarker: (id: string) => void;
  inPt: number | null;
  outPt: number | null;
  sprite?: { url: string; cols: number; count: number; aspect: number } | null;
  waveform?: number[] | null;
  tall?: boolean;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);
  const D = duration || 1;
  const pct = (x: number) => `${(Math.min(Math.max(x, 0), D) / D) * 100}%`;
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * D;
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setHover(null);
    onScrubEnd?.();
  };

  const thumbW = 160;
  return (
    <div className="relative select-none">
      {/* chấm comment */}
      <div className="relative mb-1 h-5">
        {markers.map((m) => (
          <button
            key={m.id}
            title={m.label}
            onClick={() => onMarker(m.id)}
            className={cn("group absolute top-0 flex h-5 items-center", m.active ? "z-10" : "z-0")}
            style={{
              left: pct(m.start),
              width: m.end != null ? `max(10px, calc(${pct(m.end)} - ${pct(m.start)}))` : undefined,
              translate: m.end != null ? "-5px 0" : "-50%",
            }}
          >
            {m.end != null && (
              <span className="absolute inset-x-[5px] top-1/2 h-1 -translate-y-1/2 rounded-full opacity-60" style={{ background: m.color }} />
            )}
            <span
              className={cn(
                "relative size-2.5 rounded-full ring-2 ring-[#08090b] transition-transform group-hover:scale-150",
                m.active && "scale-150 ring-white",
                m.resolved && "opacity-40",
              )}
              style={{ background: m.color }}
            />
          </button>
        ))}
      </div>
      <div
        ref={bar}
        className={cn("group relative cursor-pointer touch-none", tall ? "h-16" : "h-5 sm:h-3")}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          onScrubStart?.();
          onSeek(at(e.clientX));
        }}
        onPointerMove={(e) => {
          setHover(at(e.clientX));
          if (dragging.current) onSeek(at(e.clientX));
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={(e) => {
          if (!dragging.current || e.pointerType !== "mouse") setHover(null);
        }}
      >
        {waveform && waveform.length > 0 ? (
          <Waveform peaks={waveform} progress={t / D} />
        ) : (
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15 transition-[height] group-hover:h-1.5">
            <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: pct(buffered) }} />
            <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: pct(t) }} />
          </div>
        )}
        {(inPt != null || outPt != null) && (
          <div
            className="pointer-events-none absolute inset-y-0 border-x-2 border-warn bg-warn/15"
            style={{ left: pct(inPt ?? 0), width: `calc(${pct(outPt ?? D)} - ${pct(inPt ?? 0)})` }}
          />
        )}
        <div className="pointer-events-none absolute inset-y-[-3px] w-0.5 -translate-x-1/2 rounded bg-white" style={{ left: pct(t) }} />
        {hover != null && (
          <div
            className="pointer-events-none absolute bottom-full z-20 mb-6 -translate-x-1/2 overflow-hidden rounded-md border border-line-2 bg-[#08090b] shadow-xl"
            style={{ left: `clamp(${sprite ? thumbW / 2 : 40}px, ${pct(hover)}, calc(100% - ${sprite ? thumbW / 2 : 40}px))` }}
          >
            {sprite && (() => {
              const idx = Math.min(sprite.count - 1, Math.floor((hover / D) * sprite.count));
              const col = idx % sprite.cols;
              const row = Math.floor(idx / sprite.cols);
              return (
                <div
                  style={{
                    width: thumbW,
                    height: thumbW / sprite.aspect,
                    backgroundImage: `url(${sprite.url})`,
                    backgroundSize: `${sprite.cols * 100}% ${10 * 100}%`,
                    backgroundPosition: `${(col / (sprite.cols - 1)) * 100}% ${(row / 9) * 100}%`,
                  }}
                />
              );
            })()}
            <div className="px-2 py-0.5 text-center font-mono text-[11px] tabular-nums text-fg">{formatTime(hover, fps, mode)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Waveform({ peaks, progress }: { peaks: number[]; progress: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = c.clientWidth;
      const H = c.clientHeight;
      c.width = W * dpr;
      c.height = H * dpr;
      const g = c.getContext("2d")!;
      g.scale(dpr, dpr);
      const bars = Math.max(1, Math.floor(W / 3));
      const per = peaks.length / bars;
      for (let i = 0; i < bars; i++) {
        let v = 0;
        for (let j = Math.floor(i * per); j < Math.min(peaks.length, Math.floor((i + 1) * per) || 1); j++) v = Math.max(v, peaks[j]);
        const bh = Math.max(2, v * H * 0.95);
        g.fillStyle = i / bars < progress ? "#ff6b4a" : "rgba(255,255,255,0.28)";
        g.fillRect(i * 3, (H - bh) / 2, 2, bh);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [peaks, progress]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export function Transport({
  el,
  s,
  fps,
  mode,
  setMode,
  tr,
  loop,
  setLoop,
  inPt,
  outPt,
  setIn,
  setOut,
  clearInOut,
  fullscreen,
  onFullscreen,
  extra,
}: {
  el: HTMLMediaElement | null;
  s: MediaState;
  fps: number;
  mode: TcMode;
  setMode: (m: TcMode) => void;
  tr: ReturnType<typeof useTransport>;
  loop: boolean;
  setLoop: (v: boolean) => void;
  inPt: number | null;
  outPt: number | null;
  setIn: () => void;
  setOut: () => void;
  clearInOut: () => void;
  fullscreen: boolean;
  onFullscreen?: () => void;
  extra?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-1 text-sm max-sm:gap-0.5">
      <button className="btn-icon" onClick={() => tr.step(-1)} title={t("Lùi 1 khung hình (←)")}>
        <StepBack size={16} />
      </button>
      <button className="btn-icon size-9 text-fg" onClick={tr.toggle} title={t("Phát / dừng (Space, K)")}>
        {s.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <button className="btn-icon" onClick={() => tr.step(1)} title={t("Tới 1 khung hình (→)")}>
        <StepForward size={16} />
      </button>
      <Menu
        align="left"
        up
        trigger={() => (
          <span className="ml-1 cursor-pointer rounded-md px-2 py-1 font-mono text-[13px] tabular-nums text-fg hover:bg-panel-2" title={t("Đổi cách hiển thị thời gian")}>
            {formatTime(s.t, fps, mode)}
            <span className="text-dim"> / {formatTime(s.duration, fps, mode)}</span>
          </span>
        )}
      >
        {(close) =>
          (Object.keys(TC_LABEL) as TcMode[]).map((m) => (
            <MenuItem
              key={m}
              onClick={() => {
                setMode(m);
                close();
              }}
            >
              <span className={cn(m === mode && "text-accent")}>{t(TC_LABEL[m])}</span>
            </MenuItem>
          ))
        }
      </Menu>
      <span className="ml-1 hidden text-xs text-dim md:inline">{Math.round(fps * 100) / 100} fps</span>

      <div className="flex-1" />
      {extra}

      <div className="flex items-center gap-1 rounded-lg px-1 max-sm:hidden">
        <button
          className={cn("btn-icon w-auto px-2 text-xs font-semibold", inPt != null && "text-warn")}
          onClick={setIn}
          title={t("Đặt điểm vào (I)")}
        >
          {inPt != null ? `In ${formatTime(inPt, fps, mode)}` : "In"}
        </button>
        <button
          className={cn("btn-icon w-auto px-2 text-xs font-semibold", outPt != null && "text-warn")}
          onClick={setOut}
          title={t("Đặt điểm ra (O)")}
        >
          {outPt != null ? `Out ${formatTime(outPt, fps, mode)}` : "Out"}
        </button>
        {(inPt != null || outPt != null) && (
          <button className="btn-icon size-7" onClick={clearInOut} title={t("Bỏ In/Out (X)")}>
            <X size={14} />
          </button>
        )}
      </div>
      <button className={cn("btn-icon max-sm:hidden", loop && "bg-accent/15 text-accent")} onClick={() => setLoop(!loop)} title={t("Lặp lại (đoạn In/Out nếu có)")}>
        <Repeat size={16} />
      </button>
      <Menu
        up
        trigger={() => (
          <span className="btn-icon w-auto cursor-pointer px-2 text-xs font-semibold tabular-nums" title={t("Tốc độ phát")}>
            {s.rate}x
          </span>
        )}
      >
        {(close) =>
          RATES.map((r) => (
            <MenuItem
              key={r}
              onClick={() => {
                if (el) el.playbackRate = r;
                close();
              }}
            >
              <span className={cn(r === s.rate && "text-accent")}>{r}x</span>
            </MenuItem>
          ))
        }
      </Menu>
      <div className="group flex items-center max-sm:hidden">
        <button className="btn-icon" onClick={() => el && (el.muted = !el.muted)} title={t("Tắt / bật tiếng (M)")}>
          {s.muted || s.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.muted ? 0 : s.volume}
          onChange={(e) => {
            if (!el) return;
            el.volume = Number(e.target.value);
            el.muted = el.volume === 0;
          }}
          className="w-0 accent-accent opacity-0 transition-all group-hover:w-20 group-hover:opacity-100"
          aria-label={t("Âm lượng")}
        />
      </div>
      {onFullscreen && (
        <button className="btn-icon" onClick={onFullscreen} title={t("Toàn màn hình (F)")}>
          {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      )}
    </div>
  );
}
