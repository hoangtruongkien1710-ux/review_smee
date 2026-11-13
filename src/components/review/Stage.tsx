"use client";

// Khung hiển thị media đúng tỉ lệ + lớp vẽ (annotation) và ghim comment phía trên.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Shape } from "@/lib/comment-dto";
import { cn } from "@/lib/utils";

export type Tool = Shape["t"];
export const DRAW_COLORS = ["#FF4D4F", "#FFC53D", "#73D13D", "#36CFC9", "#4096FF", "#FFFFFF"];

/** Tính khung lớn nhất có tỉ lệ `aspect` nằm vừa trong phần tử cha. */
export function FitBox({
  aspect,
  className,
  children,
}: {
  aspect: number;
  className?: string;
  children: (box: { w: number; h: number }) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 16 / 9;
  let w = size.w;
  let h = w / a;
  if (h > size.h) {
    h = size.h;
    w = h * a;
  }
  return (
    <div ref={ref} className={cn("relative flex min-h-0 min-w-0 flex-1 items-center justify-center", className)}>
      {size.w > 0 && (
        <div className="relative" style={{ width: Math.floor(w), height: Math.floor(h) }}>
          {children({ w: Math.floor(w), h: Math.floor(h) })}
        </div>
      )}
    </div>
  );
}

export function ShapeEl({ s, w, h }: { s: Shape; w: number; h: number }) {
  const sw = Math.max(1.5, s.w * w);
  const P = (i: number) => [s.p[i] * w, s.p[i + 1] * h] as const;
  const common = { stroke: s.c, strokeWidth: sw, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (s.t === "pen") {
    let d = "";
    for (let i = 0; i + 1 < s.p.length; i += 2) {
      const [x, y] = P(i);
      d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return <path d={d} {...common} />;
  }
  const [x1, y1] = P(0);
  const [x2, y2] = P(2);
  if (s.t === "rect")
    return <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} {...common} />;
  if (s.t === "ellipse")
    return <ellipse cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2} {...common} />;
  // arrow
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(10, sw * 4);
  const a1 = ang + Math.PI * 0.85;
  const a2 = ang - Math.PI * 0.85;
  return (
    <g {...common}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path d={`M${x2 + Math.cos(a1) * head} ${y2 + Math.sin(a1) * head} L${x2} ${y2} L${x2 + Math.cos(a2) * head} ${y2 + Math.sin(a2) * head}`} />
    </g>
  );
}

export type Pin = { id: string; x: number; y: number; n: number; color: string; resolved?: boolean };

/** Lớp phủ trên khung hình: hiện nét vẽ, cho vẽ mới, hiện/đặt ghim. Toạ độ chuẩn hoá 0..1. */
export function Overlay({
  w,
  h,
  shapes,
  drawing,
  tool,
  color,
  onAdd,
  pins = [],
  activePinId,
  onPinClick,
  placingPin,
  onPlacePin,
  draftPin,
}: {
  w: number;
  h: number;
  shapes: Shape[];
  drawing?: boolean;
  tool?: Tool;
  color?: string;
  onAdd?: (s: Shape) => void;
  pins?: Pin[];
  activePinId?: string | null;
  onPinClick?: (id: string) => void;
  placingPin?: boolean;
  onPlacePin?: (x: number, y: number) => void;
  draftPin?: { x: number; y: number } | null;
}) {
  const [cur, setCur] = useState<Shape | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pt = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
  };
  useEffect(() => {
    if (!drawing) setCur(null);
  }, [drawing]);
  const active = drawing || placingPin;

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        ref={svg}
        width={w}
        height={h}
        className={cn("absolute inset-0 touch-none", active && "pointer-events-auto", drawing && "cursor-crosshair", placingPin && "cursor-copy")}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const [x, y] = pt(e);
          if (placingPin && !drawing) {
            onPlacePin?.(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
            return;
          }
          if (!drawing || !tool) return;
          (e.target as Element).setPointerCapture(e.pointerId);
          setCur({ t: tool, c: color ?? DRAW_COLORS[0], w: 0.004, p: [x, y, x, y] });
        }}
        onPointerMove={(e) => {
          if (!cur) return;
          const [x, y] = pt(e);
          if (cur.t === "pen") {
            const lx = cur.p[cur.p.length - 2];
            const ly = cur.p[cur.p.length - 1];
            if (Math.hypot(x - lx, y - ly) < 0.002) return;
            if (cur.p.length >= 3998) return;
            setCur({ ...cur, p: [...cur.p, x, y] });
          } else setCur({ ...cur, p: [cur.p[0], cur.p[1], x, y] });
        }}
        onPointerUp={() => {
          if (!cur) return;
          const big =
            cur.t === "pen" ? cur.p.length > 4 : Math.hypot(cur.p[2] - cur.p[0], cur.p[3] - cur.p[1]) > 0.008;
          if (big) {
            const r = (n: number) => Math.round(Math.min(1.2, Math.max(-0.2, n)) * 10000) / 10000;
            onAdd?.({ ...cur, p: cur.p.map(r) });
          }
          setCur(null);
        }}
      >
        {shapes.map((s, i) => (
          <ShapeEl key={i} s={s} w={w} h={h} />
        ))}
        {cur && <ShapeEl s={cur} w={w} h={h} />}
      </svg>
      {pins.map((p) => (
        <button
          key={p.id}
          onClick={() => onPinClick?.(p.id)}
          className={cn(
            "pointer-events-auto absolute flex size-7 -translate-x-1/2 -translate-y-[121%] items-center justify-center rounded-full rounded-bl-none border-2 text-xs font-bold text-[#0e0f12] shadow-lg transition-transform",
            activePinId === p.id ? "z-10 scale-125 border-white" : "border-black/40",
            p.resolved && "opacity-50",
          )}
          style={{ left: p.x * w, top: p.y * h, background: p.color, rotate: "-45deg" }}
          title={`Comment #${p.n}`}
        >
          <span style={{ rotate: "45deg" }}>{p.n}</span>
        </button>
      ))}
      {draftPin && (
        <span
          className="absolute flex size-7 -translate-x-1/2 -translate-y-[121%] animate-pulse items-center justify-center rounded-full rounded-bl-none border-2 border-white bg-accent text-xs font-bold text-white shadow-lg"
          style={{ left: draftPin.x * w, top: draftPin.y * h, rotate: "-45deg" }}
        >
          <span style={{ rotate: "45deg" }}>+</span>
        </span>
      )}
    </div>
  );
}
