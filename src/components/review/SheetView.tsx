"use client";

// Xem bảng tính dạng bảng như Excel: tab sheet, tiêu đề cột/dòng cố định, gộp ô, màu nền, chữ đậm.
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import type { SheetData, SheetFile } from "@/lib/sheet-dto";
import { cn } from "@/lib/utils";
import { useT } from "../I18n";

const ROW_H = 22;
const HEAD_W = 46;
const STEP = 200; // số dòng vẽ thêm mỗi lần cuộn tới cuối

function colName(i: number) {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

export function SheetView({
  url,
  sheet,
  onSheet,
  onLoaded,
}: {
  url: string;
  /** sheet đang xem, đếm từ 1 */
  sheet: number;
  onSheet: (n: number) => void;
  onLoaded?: (names: string[]) => void;
}) {
  const t = useT();
  const [data, setData] = useState<SheetFile | null>(null);
  const [err, setErr] = useState(false);
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  useEffect(() => {
    let off = false;
    setData(null);
    setErr(false);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: SheetFile) => {
        if (off) return;
        setData(j);
        loadedRef.current?.(j.sheets.map((s) => s.name));
      })
      .catch(() => !off && setErr(true));
    return () => {
      off = true;
    };
  }, [url]);

  if (err)
    return (
      <div className="m-auto text-center text-sm text-mut">
        <AlertTriangle className="mx-auto mb-2 text-err" />
        {t("Không tải được bảng tính")}
      </div>
    );
  if (!data)
    return (
      <div className="m-auto">
        <Loader2 className="animate-spin text-accent" />
      </div>
    );
  const visible = data.sheets.map((s, i) => ({ s, n: i + 1 })).filter((x) => !x.s.hidden || x.n === sheet);
  const cur = data.sheets[sheet - 1] ?? data.sheets[0];
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {cur ? <Grid key={sheet} s={cur} /> : <p className="m-auto text-sm text-mut">{t("Bảng tính trống")}</p>}
      {visible.length > 0 && (
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-t border-line bg-panel px-2 py-1">
          {visible.map(({ s, n }) => (
            <button
              key={n}
              onClick={() => onSheet(n)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1 text-xs",
                n === sheet || (!data.sheets[sheet - 1] && n === 1) ? "bg-accent/15 font-semibold text-accent" : "text-mut hover:bg-panel-2 hover:text-fg",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Grid({ s }: { s: SheetData }) {
  const t = useT();
  const [limit, setLimit] = useState(STEP);
  const box = useRef<HTMLDivElement>(null);
  const nCols = Math.max(s.widths.length, ...s.rows.slice(0, 200).map((r) => r.length), 1);
  const nRows = Math.max(s.rows.length, 1);

  // ô bị che bởi vùng gộp + kích thước vùng gộp
  const { covered, span } = useMemo(() => {
    const covered = new Set<string>();
    const span = new Map<string, [number, number]>();
    for (const [r1, c1, r2, c2] of s.merges) {
      span.set(`${r1}:${c1}`, [r2 - r1 + 1, c2 - c1 + 1]);
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(`${r}:${c}`);
    }
    return { covered, span };
  }, [s.merges]);

  // vị trí trái của các cột cố định (để sticky)
  const lefts = useMemo(() => {
    const a: number[] = [];
    let x = HEAD_W;
    for (let c = 0; c < s.freezeCols; c++) {
      a.push(x);
      x += s.widths[c] ?? 70;
    }
    return a;
  }, [s.freezeCols, s.widths]);

  const onScroll = () => {
    const el = box.current;
    if (el && limit < nRows && el.scrollTop + el.clientHeight > el.scrollHeight - 400) setLimit((l) => Math.min(nRows, l + STEP));
  };

  const shown = Math.min(limit, nRows);
  const totalW = HEAD_W + Array.from({ length: nCols }, (_, c) => s.widths[c] ?? 70).reduce((a, b) => a + b, 0);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={box} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto bg-white text-[12.5px] text-[#1f1f1f]">
        <table className="border-separate border-spacing-0" style={{ tableLayout: "fixed", width: totalW }}>
          <colgroup>
            <col style={{ width: HEAD_W }} />
            {Array.from({ length: nCols }, (_, c) => (
              <col key={c} style={{ width: s.widths[c] ?? 70 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-r border-[#c8c8c8] bg-[#efefef]" style={{ height: ROW_H }} />
              {Array.from({ length: nCols }, (_, c) => (
                <th
                  key={c}
                  className={cn("sticky top-0 border-b border-r border-[#c8c8c8] bg-[#efefef] px-1 text-center text-[11px] font-normal text-[#555]", c < s.freezeCols ? "z-30" : "z-20")}
                  style={{ left: c < s.freezeCols ? lefts[c] : undefined, display: s.widths[c] === 0 ? "none" : undefined }}
                >
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: shown }, (_, r) => {
              const row = s.rows[r] ?? [];
              const h = s.heights[r];
              if (h === 0) return null;
              const frozenRow = r < s.freezeRows;
              const top = frozenRow ? ROW_H + s.heights.slice(0, r).reduce<number>((a, x) => a + (x ?? ROW_H), 0) : undefined;
              return (
                <tr key={r} style={{ height: h ?? ROW_H }}>
                  <td
                    className={cn("sticky left-0 border-b border-r border-[#c8c8c8] bg-[#efefef] px-1 text-right text-[11px] text-[#555]", frozenRow ? "z-30" : "z-10")}
                    style={{ top }}
                  >
                    {r + 1}
                  </td>
                  {Array.from({ length: nCols }, (_, c) => {
                    if (covered.has(`${r}:${c}`)) return null;
                    const cell = row[c];
                    const sp = span.get(`${r}:${c}`);
                    const frozenCol = c < s.freezeCols;
                    return (
                      <td
                        key={c}
                        rowSpan={sp?.[0]}
                        colSpan={sp?.[1]}
                        title={cell?.v && cell.v.length > 40 ? cell.v : undefined}
                        className={cn(
                          "overflow-hidden border-b border-r border-[#e1e1e1] px-1 align-top leading-[1.35]",
                          cell?.w ? "whitespace-pre-wrap break-words" : "whitespace-nowrap",
                          (frozenRow || frozenCol) && "sticky",
                          frozenRow && frozenCol ? "z-20" : frozenRow || frozenCol ? "z-10" : "",
                        )}
                        style={{
                          display: s.widths[c] === 0 ? "none" : undefined,
                          top,
                          left: frozenCol ? lefts[c] : undefined,
                          background: cell?.bg ?? (frozenRow || frozenCol ? "#fff" : undefined),
                          color: cell?.c,
                          fontWeight: cell?.b ? 600 : undefined,
                          fontStyle: cell?.i ? "italic" : undefined,
                          textDecoration: [cell?.u && "underline", cell?.s && "line-through"].filter(Boolean).join(" ") || undefined,
                          textAlign: cell?.al === "c" ? "center" : cell?.al === "r" ? "right" : undefined,
                        }}
                      >
                        {cell?.v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {s.truncated && (
        <p className="shrink-0 border-t border-line bg-panel px-3 py-1 text-[11px] text-dim">
          {t("Chỉ hiển thị {r} dòng × {c} cột đầu (file có {R} dòng × {C} cột). Tải file gốc để xem đầy đủ.", {
            r: s.rows.length,
            c: s.widths.length,
            R: s.truncated.rows,
            C: s.truncated.cols,
          })}
        </p>
      )}
    </div>
  );
}
