"use client";

import { useEffect, useLayoutEffect, useRef, useState, createContext, useContext, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Eye, EyeOff } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/* ---------------- Logo ---------------- */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#FF6B4A" />
      <path d="M12 9.5v13l10-6.5-10-6.5z" fill="#fff" />
      <circle cx="23.5" cy="8.5" r="3" fill="#0e0f12" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, color, size = 28, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      title={name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#0e0f12]", className)}
      style={{ width: size, height: size, background: color, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="card w-full shadow-2xl" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Dropdown menu ---------------- */
// Menu hiển thị qua portal (position: fixed) để không bị cắt bởi thẻ có overflow-hidden / bảng cuộn ngang.
export function Menu({
  trigger,
  children,
  align = "right",
  up = false,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  up?: boolean;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const open = !!rect;
  const close = useCallback(() => setRect(null), []);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || pop.current?.contains(t)) return;
      close();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, close]);
  // Lật menu lên trên nếu sát đáy màn hình
  const [flip, setFlip] = useState(false);
  useLayoutEffect(() => {
    if (!rect || !pop.current) return;
    const h = pop.current.offsetHeight;
    setFlip(up ? rect.top - h - 4 >= 0 : rect.bottom + h + 4 > window.innerHeight);
  }, [rect, up]);
  const style: React.CSSProperties | undefined = rect
    ? {
        position: "fixed",
        ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        ...(align === "right" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
      }
    : undefined;
  return (
    <div className="relative" ref={ref}>
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRect((r) => (r ? null : ref.current!.getBoundingClientRect()));
        }}
      >
        {trigger(open)}
      </div>
      {open &&
        createPortal(
          <div
            ref={pop}
            style={style}
            className="z-[70] min-w-48 rounded-lg border border-line-2 bg-panel-2 p-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  danger,
  icon,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-line",
        danger ? "text-err" : "text-fg",
      )}
    >
      {icon && <span className="text-mut">{icon}</span>}
      {children}
    </button>
  );
}

/* ---------------- Toast ---------------- */
type Toast = { id: number; text: string; kind: "ok" | "err" };
const ToastCtx = createContext<(text: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm shadow-xl",
              t.kind === "ok" ? "border-line-2 bg-panel-2 text-fg" : "border-err/40 bg-[#2a1418] text-[#ffb4c0]",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- fetch helper ---------------- */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Lỗi ${res.status}`);
  return data as T;
}

/* ---------------- Confirm ---------------- */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; text: string; ok: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (title: string, text: string, ok = "Xoá") =>
    new Promise<boolean>((resolve) => setState({ title, text, ok, resolve }));
  const node = state ? (
    <Modal
      open
      title={state.title}
      onClose={() => {
        state.resolve(false);
        setState(null);
      }}
    >
      <p className="text-sm text-mut">{state.text}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          className="btn-ghost"
          onClick={() => {
            state.resolve(false);
            setState(null);
          }}
        >
          Huỷ
        </button>
        <button
          className="btn-danger"
          onClick={() => {
            state.resolve(true);
            setState(null);
          }}
        >
          {state.ok}
        </button>
      </div>
    </Modal>
  ) : null;
  return { confirm, node };
}

/* ---------------- Ô mật khẩu có nút con mắt ---------------- */
export function PasswordInput({
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { className?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <input {...props} type={show ? "text" : "password"} className="input pr-10" />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(!show)}
        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-mut hover:text-fg"
        title={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
