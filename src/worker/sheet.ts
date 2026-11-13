// Đọc bảng tính (xlsx; xls/ods/csv/numbers được LibreOffice đổi sang xlsx trước) thành JSON để xem dạng bảng trên web.
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import type { SheetData, SheetCell, SheetFile } from "../lib/sheet-dto.ts";
import { run } from "./media.ts";

export const SHEET_EXTS = ["xlsx", "xlsm", "xls", "ods", "csv", "numbers"];
const MAX_ROWS = Number(process.env.SHEET_MAX_ROWS || 5000);
const MAX_COLS = Number(process.env.SHEET_MAX_COLS || 100);

/** Đổi sang .xlsx bằng LibreOffice nếu cần. */
async function toXlsx(input: string, ext: string, workDir: string) {
  if (ext === "xlsx" || ext === "xlsm") return input;
  const named = path.join(workDir, `sheet-src.${ext}`);
  fs.copyFileSync(input, named);
  await run("soffice", ["--headless", "--norestore", `-env:UserInstallation=file://${workDir}/lo-profile`, "--convert-to", "xlsx", "--outdir", workDir, named], { timeoutMs: 180_000 });
  const out = path.join(workDir, "sheet-src.xlsx");
  if (!fs.existsSync(out)) throw new Error("Không đổi được bảng tính sang xlsx");
  return out;
}

const argb = (c?: { argb?: string; theme?: number }) => {
  const v = c?.argb;
  if (!v || v.length < 6) return undefined;
  const hex = v.slice(-6).toUpperCase();
  return `#${hex}`;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Hiển thị giá trị gần giống Excel (định dạng cơ bản: %, phân cách nghìn, số lẻ, ngày). */
function display(cell: ExcelJS.Cell): string {
  let v: unknown = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && v !== null) {
    if (v instanceof Date) v = v;
    else if ("result" in v) v = (v as { result?: unknown }).result; // công thức
    else if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    else if ("text" in v) return String((v as { text: unknown }).text ?? ""); // hyperlink
    else if ("error" in v) return String((v as { error: unknown }).error);
  }
  if (v == null) return "";
  const fmt = cell.numFmt || "";
  if (v instanceof Date) {
    const d = v;
    const hasTime = /h|s/i.test(fmt.replace(/"[^"]*"/g, "")) && !/^[dmy\W]*$/i.test(fmt);
    const date = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
  }
  if (typeof v === "number") {
    const dec = /0\.(0+)/.exec(fmt)?.[1].length ?? (Number.isInteger(v) ? 0 : undefined);
    if (fmt.includes("%")) return `${(v * 100).toFixed(dec ?? 0)}%`;
    if (fmt.includes(",")) return v.toLocaleString("en-US", { minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 2 });
    if (dec != null) return v.toFixed(dec);
    return String(Math.round(v * 1e10) / 1e10);
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

function styleOf(cell: ExcelJS.Cell): Omit<SheetCell, "v"> {
  const s: Omit<SheetCell, "v"> = {};
  const f = cell.font;
  if (f?.bold) s.b = 1;
  if (f?.italic) s.i = 1;
  if (f?.underline) s.u = 1;
  if (f?.strike) s.s = 1;
  const fc = argb(f?.color);
  if (fc && fc !== "#000000") s.c = fc;
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (fill?.type === "pattern" && fill.pattern === "solid") {
    const bg = argb(fill.fgColor);
    if (bg && bg !== "#FFFFFF") s.bg = bg;
  }
  const a = cell.alignment;
  if (a?.horizontal === "center" || a?.horizontal === "centerContinuous") s.al = "c";
  else if (a?.horizontal === "right") s.al = "r";
  if (a?.wrapText) s.w = 1;
  if (cell.value instanceof Date || typeof cell.value === "number" || (cell.value && typeof cell.value === "object" && "result" in cell.value && typeof (cell.value as { result?: unknown }).result === "number"))
    if (!s.al) s.al = "r";
  return s;
}

export async function readSheets(input: string, ext: string, workDir: string): Promise<SheetFile> {
  const file = await toXlsx(input, ext, workDir);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets: SheetData[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state === "veryHidden") continue;
    const rowCount = ws.actualRowCount ? ws.rowCount : 0;
    const colCount = ws.columnCount;
    const nRows = Math.min(rowCount, MAX_ROWS);
    const nCols = Math.min(colCount, MAX_COLS);
    const rows: (SheetCell | null)[][] = [];
    const heights: (number | null)[] = [];
    for (let r = 1; r <= nRows; r++) {
      const row = ws.getRow(r);
      heights.push(row.height ? Math.round(row.height * 1.33) : null);
      const cells: (SheetCell | null)[] = [];
      for (let c = 1; c <= nCols; c++) {
        const cell = row.getCell(c);
        if (cell.isMerged && cell.master !== cell) {
          cells.push(null);
          continue;
        }
        const v = display(cell);
        const st = styleOf(cell);
        cells.push(v || Object.keys(st).length ? { v, ...st } : null);
      }
      // bỏ ô trống cuối dòng cho nhẹ
      while (cells.length && cells[cells.length - 1] == null) cells.pop();
      rows.push(cells);
      if (row.hidden) heights[heights.length - 1] = 0;
    }
    const widths: number[] = [];
    for (let c = 1; c <= nCols; c++) {
      const col = ws.getColumn(c);
      widths.push(col.hidden ? 0 : Math.round((col.width ?? 9) * 7.5 + 10));
    }
    const merges: [number, number, number, number][] = [];
    const model = ws.model as unknown as { merges?: string[] };
    for (const ref of model.merges ?? []) {
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
      if (!m) continue;
      const col = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      const r1 = Number(m[2]) - 1, c1 = col(m[1]) - 1, r2 = Number(m[4]) - 1, c2 = col(m[3]) - 1;
      if (r1 < nRows && c1 < nCols) merges.push([r1, c1, Math.min(r2, nRows - 1), Math.min(c2, nCols - 1)]);
    }
    const frozen = ws.views?.find((v) => v.state === "frozen") as { xSplit?: number; ySplit?: number } | undefined;
    sheets.push({
      name: ext === "csv" ? "Sheet1" : ws.name,
      hidden: ws.state === "hidden" || undefined,
      rows,
      widths,
      heights,
      merges,
      freezeRows: frozen?.ySplit || 0,
      freezeCols: frozen?.xSplit || 0,
      truncated: rowCount > nRows || colCount > nCols ? { rows: rowCount, cols: colCount } : undefined,
    });
  }
  return { sheets };
}
