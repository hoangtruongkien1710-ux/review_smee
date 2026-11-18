"use client";

// Khung comment bên phải: danh sách, lọc, trả lời, nhắc tên @, đánh dấu xong, ô viết comment.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  CornerDownRight,
  FileText,
  Lock,
  MapPin,
  MoreHorizontal,
  PenLine,
  Search,
  Send,
  Link2,
  Pencil,
  Trash2,
  MessageSquare,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n, useT } from "../I18n";
import { localeOf } from "@/lib/i18n";
import { MENTION_RE, type CommentDTO, type Person } from "@/lib/comment-dto";
import { Avatar, Menu, MenuItem } from "../ui";

/* ---------- nhắc tên ---------- */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "@Tên" → "@[Tên](id)" cho những người có trong danh sách. */
export function encodeMentions(text: string, people: Person[]) {
  const names = [...people].sort((a, b) => b.name.length - a.name.length);
  if (!names.length) return text;
  const re = new RegExp(`@(${names.map((p) => esc(p.name)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  return text.replace(re, (_m, name: string) => {
    const p = names.find((x) => x.name === name)!;
    return `@[${p.name}](${p.id})`;
  });
}
export const decodeMentions = (body: string) => body.replace(MENTION_RE, (_m, name) => `@${name}`);

export function CommentBody({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index! > last) parts.push(body.slice(last, m.index));
    parts.push(
      <span key={m.index} className="rounded bg-accent/15 px-0.5 font-medium text-accent">
        @{m[1]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-fg">{parts}</p>;
}

/** Ô nhập có gợi ý @nhắc tên. Enter gửi, Shift+Enter xuống dòng. */
export function MentionInput({
  value,
  onChange,
  people,
  onSubmit,
  placeholder,
  autoFocus,
  onFocus,
  rows = 2,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  people: Person[];
  onSubmit: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  rows?: number;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const t = useT();
  const ref = inputRef ?? own;
  const [q, setQ] = useState<{ start: number; text: string } | null>(null);
  const [sel, setSel] = useState(0);
  const list = useMemo(() => {
    if (!q) return [];
    const s = q.text.toLowerCase();
    return people.filter((p) => p.name.toLowerCase().includes(s) || p.email.toLowerCase().startsWith(s)).slice(0, 6);
  }, [q, people]);

  const detect = (el: HTMLTextAreaElement) => {
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const m = /(^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30}){0,2})$/u.exec(before);
    if (m) {
      setQ({ start: pos - m[2].length - 1, text: m[2] });
      setSel(0);
    } else setQ(null);
  };
  const pick = (p: Person) => {
    const el = ref.current!;
    const pos = el.selectionStart;
    const next = value.slice(0, q!.start) + `@${p.name} ` + value.slice(pos);
    caret.current = q!.start + p.name.length + 2;
    onChange(next);
    setQ(null);
  };
  // đặt con trỏ sau tên vừa chọn ngay khi nội dung cập nhật (trước khi người dùng gõ tiếp)
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && caret.current != null) {
      el.focus();
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value, ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // khung comment đang ẩn (popup điện thoại đóng): đo được 0, giữ chiều cao mặc định
      if (!el.offsetParent) return void (el.style.height = "");
      el.style.height = "auto";
      el.style.height = Math.min(200, el.scrollHeight) + "px";
    };
    fit();
    // popup vừa mở ra: đo lại
    const ro = new ResizeObserver(() => el.style.height === "" && el.offsetParent && fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, ref]);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onFocus={onFocus}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target);
        }}
        onClick={(e) => detect(e.currentTarget)}
        onBlur={() => setTimeout(() => setQ(null), 150)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (list.length) {
            if (e.key === "ArrowDown") return e.preventDefault(), setSel((s) => (s + 1) % list.length);
            if (e.key === "ArrowUp") return e.preventDefault(), setSel((s) => (s - 1 + list.length) % list.length);
            if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), pick(list[sel]);
            if (e.key === "Escape") return setQ(null);
          }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
        }}
        className="input max-h-[200px] resize-none bg-transparent leading-relaxed"
      />
      {list.length > 0 && (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-lg border border-line-2 bg-panel-2 p-1 shadow-xl">
          {list.map((p, i) => (
            <button
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === sel ? "bg-line" : "hover:bg-line")}
            >
              <Avatar name={p.name} color={p.color} size={22} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.client && <span className="text-[10px] text-warn">{t("Khách")}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- một comment ---------- */

export type Anchor = { label: string; icon: "time" | "page" | "pin" } | null;

function Item({
  c,
  n,
  anchor,
  me,
  people,
  canComment,
  canResolve,
  canManage,
  active,
  onSelect,
  onReply,
  onUpdate,
  onDelete,
  onCopyLink,
}: {
  c: CommentDTO;
  n: number;
  anchor: Anchor;
  me: { id: string };
  people: Person[];
  canComment: boolean;
  canResolve: boolean;
  canManage: boolean;
  active: boolean;
  onSelect: () => void;
  onReply: (body: string) => Promise<void>;
  onUpdate: (id: string, patch: { body?: string; resolved?: boolean }) => Promise<void>;
  onDelete: (id: string, isReply: boolean) => void;
  onCopyLink: () => void;
}) {
  const { t, ago, lang } = useI18n();
  const locale = localeOf(lang);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const sendReply = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      await onReply(encodeMentions(reply.trim(), people));
      setReply("");
      setReplying(false);
    } finally {
      setSending(false);
    }
  };
  const saveEdit = async () => {
    if (!editing || !editText.trim()) return;
    await onUpdate(editing, { body: encodeMentions(editText.trim(), people) });
    setEditing(null);
  };

  const head = (x: CommentDTO, isReply: boolean) => {
    const mine = x.author?.id === me.id;
    return (
      <div className="flex items-center gap-2">
        <Avatar name={x.author?.name ?? x.guestName ?? t("Khách")} color={x.author?.color ?? "#9aa1ad"} size={isReply ? 22 : 26} />
        <span className="min-w-0 truncate text-[13px] font-semibold">{x.author?.name ?? x.guestName ?? t("Khách")}</span>
        <span className="shrink-0 text-xs text-dim" title={new Date(x.createdAt).toLocaleString(locale)}>
          {ago(x.createdAt)}
          {x.edited && ` · ${t("đã sửa")}`}
        </span>
        <div className="flex-1" />
        {(mine || canManage) && (
          <Menu trigger={() => <span className="btn-icon size-6 cursor-pointer opacity-0 group-hover/c:opacity-100"><MoreHorizontal size={15} /></span>}>
            {(close) => (
              <>
                {!isReply && (
                  <MenuItem icon={<Link2 size={14} />} onClick={() => (onCopyLink(), close())}>
                    {t("Sao chép link")}
                  </MenuItem>
                )}
                {mine && (
                  <MenuItem
                    icon={<Pencil size={14} />}
                    onClick={() => {
                      setEditing(x.id);
                      setEditText(decodeMentions(x.body));
                      close();
                    }}
                  >
                    {t("Sửa")}
                  </MenuItem>
                )}
                <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (onDelete(x.id, isReply), close())}>
                  {t("Xoá")}
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>
    );
  };
  const bodyOrEdit = (x: CommentDTO) =>
    editing === x.id ? (
      <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
        <MentionInput value={editText} onChange={setEditText} people={people} onSubmit={saveEdit} autoFocus />
        <div className="mt-1.5 flex justify-end gap-1.5">
          <button className="btn-ghost h-7 text-xs" onClick={() => setEditing(null)}>
            {t("Huỷ")}
          </button>
          <button className="btn-primary h-7 text-xs" onClick={saveEdit}>
            {t("Lưu")}
          </button>
        </div>
      </div>
    ) : (
      <div className="mt-1">
        <CommentBody body={x.body} />
      </div>
    );

  return (
    <div
      ref={ref}
      id={`c-${c.id}`}
      onClick={onSelect}
      className={cn(
        "group/c cursor-pointer border-b border-line px-4 py-3 transition-colors",
        active ? "bg-accent/[0.07] shadow-[inset_2px_0_0] shadow-accent" : "hover:bg-panel-2/60",
        c.resolved && !active && "opacity-60",
      )}
    >
      {head(c, false)}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[34px]">
        <span className="text-xs font-semibold text-dim">#{n}</span>
        {anchor && (
          <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-accent">
            {anchor.icon === "time" ? <Clock size={11} /> : anchor.icon === "page" ? <FileText size={11} /> : <MapPin size={11} />}
            {anchor.label}
          </span>
        )}
        {c.annotation && (
          <span className="inline-flex items-center gap-1 text-[11px] text-mut" title={t("Có hình vẽ")}>
            <PenLine size={12} />
          </span>
        )}
        {c.fromVersionNo != null && (
          <span className="rounded bg-[#7c83fd]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#a5aaff]" title={t("Comment chưa xong từ phiên bản trước")}>
            {t("Từ V{n}", { n: c.fromVersionNo })}
          </span>
        )}
        {c.internal && (
          <span className="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-[11px] font-medium text-warn">
            <Lock size={10} /> {t("Nội bộ")}
          </span>
        )}
      </div>
      <div className="pl-[34px]">{bodyOrEdit(c)}</div>

      {c.replies.length > 0 && (
        <div className="mt-2 space-y-2.5 border-l border-line-2 pl-3 ml-[34px]">
          {c.replies.map((r) => (
            <div key={r.id} className="group/c">
              {head(r, true)}
              <div className="pl-[30px]">{bodyOrEdit(r)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 pl-[34px] text-xs">
        {canComment && (
          <button
            className="inline-flex items-center gap-1 text-mut hover:text-fg"
            onClick={(e) => {
              e.stopPropagation();
              setReplying((v) => !v);
            }}
          >
            <CornerDownRight size={13} /> {t("Trả lời")}
          </button>
        )}
        {canResolve && (
          <button
            className={cn("inline-flex items-center gap-1", c.resolved ? "text-ok" : "text-mut hover:text-ok")}
            onClick={(e) => {
              e.stopPropagation();
              void onUpdate(c.id, { resolved: !c.resolved });
            }}
            title={c.resolved ? t("Mở lại") : t("Đánh dấu đã xử lý")}
          >
            {c.resolved ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            {c.resolved ? t("Đã xong") : t("Xong")}
          </button>
        )}
      </div>
      {replying && (
        <div className="mt-2 pl-[34px]" onClick={(e) => e.stopPropagation()}>
          <MentionInput value={reply} onChange={setReply} people={people} onSubmit={sendReply} placeholder={people.length ? t("Viết trả lời… (@ để nhắc tên)") : t("Viết trả lời…")} autoFocus rows={1} />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button className="btn-ghost h-7 text-xs" onClick={() => setReplying(false)}>
              {t("Huỷ")}
            </button>
            <button className="btn-primary h-7 text-xs" disabled={!reply.trim() || sending} onClick={sendReply}>
              {t("Gửi")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- khung comment ---------- */

export type ComposerCtx = {
  anchorLabel: string | null; // "00:12:04" / "00:12 → 00:15" / "Trang 3"
  anchorIcon: "time" | "page";
  attach: boolean;
  setAttach: (v: boolean) => void;
  canDraw: boolean;
  drawing: boolean;
  setDrawing: (v: boolean) => void;
  shapeCount: number;
  canPin: boolean;
  placingPin: boolean;
  setPlacingPin: (v: boolean) => void;
  pinSet: boolean;
  clearDraft: () => void;
  onFocus: () => void;
};

type Filter = "all" | "open" | "done";

export function CommentPanel({
  comments,
  numbers,
  anchorOf,
  me,
  people,
  canComment,
  canResolve,
  canManage,
  canInternal,
  activeId,
  onSelect,
  onCreate,
  onReply,
  onUpdate,
  onDelete,
  onCopyLink,
  composer,
  inputRef,
  mobileOpen = false,
  onMobileClose,
}: {
  comments: CommentDTO[];
  numbers: Map<string, number>;
  anchorOf: (c: CommentDTO) => Anchor;
  me: { id: string };
  people: Person[];
  canComment: boolean;
  /** Đánh dấu xong / mở lại (mặc định = canComment) */
  canResolve?: boolean;
  canManage: boolean;
  canInternal: boolean;
  activeId: string | null;
  onSelect: (c: CommentDTO) => void;
  onCreate: (body: string, internal: boolean) => Promise<boolean>;
  onReply: (parentId: string, body: string) => Promise<void>;
  onUpdate: (id: string, patch: { body?: string; resolved?: boolean }) => Promise<void>;
  onDelete: (id: string, isReply: boolean) => void;
  onCopyLink: (c: CommentDTO) => void;
  composer: ComposerCtx;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Màn hình nhỏ: khung comment là popup, mở/đóng bằng nút Comment nổi. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const shown = comments.filter((c) => {
    if (filter === "open" && c.resolved) return false;
    if (filter === "done" && !c.resolved) return false;
    if (q) {
      const s = q.toLowerCase();
      const hay = [c, ...c.replies].map((x) => decodeMentions(x.body) + " " + (x.author?.name ?? "")).join(" ").toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });
  const openCount = comments.filter((c) => !c.resolved).length;

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const ok = await onCreate(encodeMentions(body, people), internal);
      if (ok) setText("");
    } finally {
      setSending(false);
    }
  };

  const tabs: [Filter, string][] = [
    ["all", t("Tất cả {n}", { n: comments.length })],
    ["open", t("Chưa xong {n}", { n: openCount })],
    ["done", t("Đã xong {n}", { n: comments.length - openCount })],
  ];

  return (
    <aside data-open={mobileOpen} className="comment-drawer flex w-[360px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex justify-center pt-2 lg:hidden phone-land:hidden" aria-hidden>
        <span className="h-1 w-10 rounded-full bg-line-2" />
      </div>
      <div className="flex items-center gap-2 px-3 pt-2 lg:hidden">
        <MessageSquare size={16} className="text-accent" />
        <span className="flex-1 text-sm font-semibold">
          {t("Comment")} <span className="text-dim">{comments.length}</span>
        </span>
        <button type="button" className="btn-icon size-9" onClick={onMobileClose} aria-label={t("Đóng")} title={t("Đóng")}>
          <X size={20} />
        </button>
      </div>
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex gap-1">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium", filter === k ? "bg-panel-2 text-fg" : "text-mut hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input h-8 pl-8" placeholder={t("Tìm trong comment…")} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-mut">
            <MessageSquare className="text-dim" />
            {comments.length === 0 ? t("Chưa có comment nào. Dừng video ở chỗ cần sửa rồi viết comment bên dưới.") : t("Không có comment khớp bộ lọc.")}
          </div>
        ) : (
          shown.map((c) => (
            <Item
              key={c.id}
              c={c}
              n={numbers.get(c.id) ?? 0}
              anchor={anchorOf(c)}
              me={me}
              people={people}
              canComment={canComment}
              canResolve={canResolve ?? canComment}
              canManage={canManage}
              active={activeId === c.id}
              onSelect={() => onSelect(c)}
              onReply={(b) => onReply(c.id, b)}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onCopyLink={() => onCopyLink(c)}
            />
          ))
        )}
      </div>

      {canComment ? (
        <div className="border-t border-line p-3">
          <div className={cn("rounded-xl border bg-bg p-2 transition-colors", internal ? "border-warn/50" : "border-line-2 focus-within:border-accent")}>
            <MentionInput
              inputRef={inputRef}
              value={text}
              onChange={setText}
              people={internal ? people.filter((p) => !p.client) : people}
              onSubmit={send}
              onFocus={composer.onFocus}
              placeholder={internal ? t("Comment nội bộ (khách không thấy)…") : people.length ? t("Viết comment… (@ để nhắc tên)") : t("Viết comment…")}
            />
            <div
              className="mt-1 flex flex-wrap items-center gap-1"
              // giữ con trỏ trong ô nhập khi bấm các nút nhỏ (Enter vẫn là gửi)
              onMouseDown={(e) => (e.target as HTMLElement).closest("button") && e.preventDefault()}
            >
              {composer.anchorLabel && (
                <button
                  onClick={() => composer.setAttach(!composer.attach)}
                  title={composer.attach ? t("Bỏ gắn mốc") : t("Gắn mốc")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-2 font-mono text-[11.5px] font-semibold",
                    composer.attach ? "bg-accent/15 text-accent" : "text-dim line-through hover:text-mut",
                  )}
                >
                  {composer.anchorIcon === "time" ? <Clock size={12} /> : <FileText size={12} />}
                  {composer.anchorLabel}
                </button>
              )}
              {composer.canDraw && (
                <button
                  onClick={() => composer.setDrawing(!composer.drawing)}
                  title={t("Vẽ lên khung hình")}
                  className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs", composer.drawing || composer.shapeCount ? "bg-accent/15 text-accent" : "text-mut hover:bg-panel-2 hover:text-fg")}
                >
                  <PenLine size={13} />
                  {composer.shapeCount ? composer.shapeCount : t("Vẽ")}
                </button>
              )}
              {composer.canPin && (
                <button
                  onClick={() => composer.setPlacingPin(!composer.placingPin)}
                  title={t("Ghim vào vị trí trên hình")}
                  className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs", composer.placingPin || composer.pinSet ? "bg-accent/15 text-accent" : "text-mut hover:bg-panel-2 hover:text-fg")}
                >
                  <MapPin size={13} />
                  {composer.pinSet ? t("Đã ghim") : t("Ghim")}
                </button>
              )}
              {canInternal && (
                <button
                  onClick={() => setInternal(!internal)}
                  title={t("Comment nội bộ: khách hàng không thấy")}
                  className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs", internal ? "bg-warn/15 text-warn" : "text-mut hover:bg-panel-2 hover:text-fg")}
                >
                  <Lock size={12} /> {t("Nội bộ")}
                </button>
              )}
              {(composer.shapeCount > 0 || composer.pinSet) && (
                <button className="h-7 rounded-md px-2 text-xs text-dim hover:text-fg" onClick={composer.clearDraft}>
                  {t("Bỏ vẽ/ghim")}
                </button>
              )}
              <div className="flex-1" />
              <button className="btn-primary h-7 px-2.5 text-xs" disabled={!text.trim() || sending} onClick={send}>
                <Send size={13} /> {t("Gửi")}
              </button>
            </div>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-dim">{t("Enter để gửi · Shift+Enter xuống dòng · C để viết nhanh")}</p>
        </div>
      ) : (
        <p className="border-t border-line p-3 text-center text-xs text-mut">{t("Bạn chỉ có quyền xem file này.")}</p>
      )}
    </aside>
  );
}
