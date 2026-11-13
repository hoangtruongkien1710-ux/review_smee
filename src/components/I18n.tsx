"use client";

// Ngữ cảnh ngôn ngữ. Trang nội bộ không bọc provider → mặc định tiếng Việt.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { LANGS, LANG_COOKIE, makeT, timeAgoT, type Lang, type T } from "@/lib/i18n";
import { Menu, MenuItem } from "./ui";
import { cn } from "@/lib/utils";

type Ctx = { lang: Lang; t: T; setLang: (l: Lang) => void; ago: (d: Date | string | number) => string };
const viT = makeT("vi");
const I18nCtx = createContext<Ctx>({ lang: "vi", t: viT, setLang: () => {}, ago: (d) => timeAgoT(viT, "vi", d) });

export function I18nProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const router = useRouter();
  const [lang, setState] = useState<Lang>(initial);
  const setLang = useCallback(
    (l: Lang) => {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      setState(l);
      router.refresh();
    },
    [router],
  );
  const value = useMemo(() => {
    const t = makeT(lang);
    return { lang, t, setLang, ago: (d: Date | string | number) => timeAgoT(t, lang, d) };
  }, [lang, setLang]);
  return (
    <I18nCtx.Provider value={value}>
      <div lang={lang} className="contents">
        {children}
      </div>
    </I18nCtx.Provider>
  );
}

export const useI18n = () => useContext(I18nCtx);
export const useT = () => useContext(I18nCtx).t;

/** Nút chọn ngôn ngữ (dùng ở trang khách). */
export function LangPicker({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const cur = LANGS.find((l) => l.code === lang)!;
  return (
    <Menu
      trigger={() => (
        <span className={cn("btn-outline h-8 cursor-pointer gap-1.5 px-2.5 text-xs", className)} title="Language">
          <Globe size={14} /> {cur.label}
        </span>
      )}
    >
      {(close) =>
        LANGS.map((l) => (
          <MenuItem
            key={l.code}
            onClick={() => {
              close();
              setLang(l.code);
            }}
          >
            <span className={cn(l.code === lang && "font-semibold text-accent")}>{l.label}</span>
          </MenuItem>
        ))
      }
    </Menu>
  );
}
