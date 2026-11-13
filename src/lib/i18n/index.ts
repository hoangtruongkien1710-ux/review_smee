// Đa ngôn ngữ cho các trang khách xem (link chia sẻ). Khoá là câu tiếng Việt gốc, biến dạng {x}.
import { DICT } from "./dict";

export const LANGS = [
  { code: "vi", label: "Tiếng Việt", locale: "vi-VN" },
  { code: "en", label: "English", locale: "en-US" },
  { code: "zh", label: "中文", locale: "zh-CN" },
  { code: "ja", label: "日本語", locale: "ja-JP" },
  { code: "ko", label: "한국어", locale: "ko-KR" },
  { code: "hi", label: "हिन्दी", locale: "hi-IN" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];
export const LANG_COOKIE = "sr_lang";
const IDX: Record<Exclude<Lang, "vi">, number> = { en: 0, zh: 1, ja: 2, ko: 3, hi: 4 };

export const isLang = (x: unknown): x is Lang => LANGS.some((l) => l.code === x);
export const localeOf = (lang: Lang) => LANGS.find((l) => l.code === lang)!.locale;

export type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

export function translate(lang: Lang, key: string, vars?: Vars) {
  let s = lang === "vi" ? key : (DICT[key]?.[IDX[lang]] ?? key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const makeT = (lang: Lang): T => (key, vars) => translate(lang, key, vars);

/** Chọn ngôn ngữ theo danh sách trình duyệt gửi (Accept-Language / navigator.languages). Khách không nói tiếng Việt → English. */
export function pickLang(list: string | readonly string[] | null | undefined): Lang {
  const items = typeof list === "string" ? list.split(",").map((x) => x.split(";")[0].trim()) : (list ?? []);
  for (const it of items) {
    const code = it.toLowerCase().split("-")[0];
    if (isLang(code)) return code;
  }
  return "en";
}

export function timeAgoT(t: T, lang: Lang, d: Date | string | number) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return t("vừa xong");
  const m = Math.round(s / 60);
  if (m < 60) return t("{n} phút trước", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("{n} giờ trước", { n: h });
  const day = Math.round(h / 24);
  if (day < 30) return t("{n} ngày trước", { n: day });
  return new Date(d).toLocaleDateString(localeOf(lang));
}
