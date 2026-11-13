"use client";

// Chuông thông báo ở thanh bên: số chưa đọc, danh sách, bấm để mở đúng comment.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Avatar, api } from "./ui";
import { cn, timeAgo } from "@/lib/utils";

type N = { id: string; actorName: string; actorColor: string | null; text: string; excerpt: string | null; link: string | null; read: boolean; createdAt: string };

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: N[]; unread: number }>("/api/notifications");
      setItems(r.items);
      setUnread(r.unread);
    } catch {}
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 30000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    void load();
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || pop.current?.contains(t)) return;
      setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, load]);

  const markRead = async (ids?: string[]) => {
    await api("/api/notifications/read", { body: ids ? { ids } : {} }).catch(() => {});
    setItems((x) => x.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
    setUnread((u) => (ids ? Math.max(0, u - ids.filter((id) => items.find((n) => n.id === id && !n.read)).length) : 0));
  };

  return (
    <>
      <button
        ref={btn}
        title="Thông báo"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex size-10 items-center justify-center rounded-lg transition-colors",
          open ? "bg-accent/15 text-accent" : "text-mut hover:bg-panel-2 hover:text-fg",
        )}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="card fixed bottom-3 left-16 top-3 z-[65] flex w-[380px] flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold">Thông báo</h2>
              {unread > 0 && (
                <button className="inline-flex items-center gap-1 text-xs text-mut hover:text-fg" onClick={() => markRead()}>
                  <CheckCheck size={14} /> Đã đọc hết
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-mut">Chưa có thông báo nào.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.read) void markRead([n.id]);
                      setOpen(false);
                      if (n.link) router.push(n.link);
                    }}
                    className={cn("flex w-full gap-3 border-b border-line px-4 py-3 text-left hover:bg-panel-2", !n.read && "bg-accent/[0.05]")}
                  >
                    <Avatar name={n.actorName} color={n.actorColor ?? "#9aa1ad"} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug">
                        <span className="font-semibold">{n.actorName}</span> <span className="text-mut">{n.text}</span>
                      </p>
                      {n.excerpt && <p className="mt-1 line-clamp-2 text-[13px] text-fg/90">{n.excerpt}</p>}
                      <p className="mt-1 text-[11px] text-dim">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
