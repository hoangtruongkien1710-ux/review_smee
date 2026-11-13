"use client";

// Tạo và quản lý link chia sẻ cho khách.
import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Lock, Trash2, Eye, Download, MessageSquare, ThumbsUp, Power, Clock } from "lucide-react";
import type { ShareDTO } from "@/lib/share-dto";
import { cn, timeAgo } from "@/lib/utils";
import { Modal, PasswordInput, api, useConfirm, useToast } from "./ui";

const EXPIRY = [
  { label: "Không hết hạn", days: 0 },
  { label: "7 ngày", days: 7 },
  { label: "30 ngày", days: 30 },
  { label: "90 ngày", days: 90 },
];

export function shareUrl(token: string) {
  return `${typeof location !== "undefined" ? location.origin : ""}/s/${token}`;
}

function copy(text: string, toast: (m: string) => void) {
  const done = () => toast("Đã sao chép link");
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => toast(text));
  else toast(text);
}

export function ShareModal({
  open,
  onClose,
  projectId,
  assets,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** File cần chia sẻ; trống = chỉ xem danh sách link */
  assets: { id: string; name: string }[];
}) {
  const toast = useToast();
  const { confirm, node: confirmNode } = useConfirm();
  const [shares, setShares] = useState<ShareDTO[] | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [days, setDays] = useState(0);
  const [allowDownload, setAllowDownload] = useState(false);
  const [allowComment, setAllowComment] = useState(true);
  const [allowApprove, setAllowApprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ShareDTO | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ shares: ShareDTO[] }>(`/api/projects/${projectId}/shares`);
      setShares(r.shares);
    } catch (e) {
      toast((e as Error).message, "err");
      setShares([]);
    }
  }, [projectId, toast]);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setName(assets.length === 1 ? assets[0].name : assets.length ? `${assets.length} file` : "");
    setPassword("");
    setDays(0);
    setAllowDownload(false);
    setAllowComment(true);
    setAllowApprove(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ share: ShareDTO }>(`/api/projects/${projectId}/shares`, {
        body: {
          name,
          assetIds: assets.map((a) => a.id),
          password: password || undefined,
          expiresAt: days ? new Date(Date.now() + days * 86400_000).toISOString() : null,
          allowDownload,
          allowComment,
          allowApprove,
        },
      });
      setCreated(r.share);
      copy(shareUrl(r.share.token), toast);
      void load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (s: ShareDTO, body: object) => {
    try {
      await api(`/api/shares/${s.id}`, { method: "PATCH", body });
      void load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const remove = async (s: ShareDTO) => {
    if (!(await confirm("Xoá link chia sẻ?", `Khách mở link "${s.name}" sẽ không vào được nữa. Comment khách đã viết vẫn giữ nguyên.`))) return;
    try {
      await api(`/api/shares/${s.id}`, { method: "DELETE" });
      void load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const toggle = (on: boolean, set: (v: boolean) => void, icon: React.ReactNode, label: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={on} onChange={(e) => set(e.target.checked)} />
      {icon}
      {label}
    </label>
  );

  return (
    <Modal open={open} onClose={onClose} title="Chia sẻ cho khách" width={560}>
      <div className="max-h-[75vh] overflow-y-auto pr-1">
        {assets.length > 0 &&
          (created ? (
            <div className="mb-5 rounded-xl border border-ok/40 bg-ok/10 p-4">
              <p className="mb-2 text-sm font-medium text-ok">Đã tạo link, đã sao chép sẵn để anh/chị gửi khách:</p>
              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-xs" readOnly value={shareUrl(created.token)} onFocus={(e) => e.target.select()} />
                <button className="btn-primary" onClick={() => copy(shareUrl(created.token), toast)}>
                  <Copy size={14} /> Sao chép
                </button>
              </div>
              {password && <p className="mt-2 text-xs text-mut">Nhớ gửi kèm mật khẩu cho khách.</p>}
              <button className="mt-3 text-xs text-mut underline" onClick={() => setCreated(null)}>
                Tạo thêm link khác
              </button>
            </div>
          ) : (
            <form onSubmit={create} className="mb-5">
              <p className="mb-3 text-sm text-mut">
                {assets.length === 1 ? (
                  <>
                    File: <b className="text-fg">{assets[0].name}</b>
                  </>
                ) : (
                  <>
                    Chia sẻ <b className="text-fg">{assets.length} file</b> trong một link
                  </>
                )}
                . Khách mở link là xem được, không cần tài khoản. Khách chỉ thấy bản mới nhất và không thấy comment nội bộ.
              </p>
              <label className="label">Tên link (để anh/chị dễ nhận ra)</label>
              <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Mật khẩu (không bắt buộc)</label>
                  <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="Để trống = không cần" />
                </div>
                <div>
                  <label className="label">Hạn dùng</label>
                  <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {EXPIRY.map((x) => (
                      <option key={x.days} value={x.days}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
                {toggle(allowComment, setAllowComment, <MessageSquare size={14} className="text-mut" />, "Cho comment")}
                {toggle(allowApprove, setAllowApprove, <ThumbsUp size={14} className="text-mut" />, "Cho duyệt")}
                {toggle(allowDownload, setAllowDownload, <Download size={14} className="text-mut" />, "Cho tải file gốc")}
              </div>
              <button className="btn-primary w-full" disabled={busy || !name.trim()}>
                <Link2 size={15} /> Tạo link
              </button>
            </form>
          ))}

        <p className="mb-2 text-xs font-medium text-dim">Các link đã tạo trong project</p>
        {!shares ? (
          <p className="text-sm text-mut">Đang tải…</p>
        ) : shares.length === 0 ? (
          <p className="text-sm text-mut">Chưa có link nào. Chọn file rồi bấm Chia sẻ để tạo.</p>
        ) : (
          <ul className="space-y-2">
            {shares.map((s) => {
              const expired = !!s.expiresAt && new Date(s.expiresAt) < new Date();
              const off = s.disabled || expired;
              return (
                <li key={s.id} className={cn("rounded-lg border border-line p-3", off && "opacity-60")}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={s.assets.map((a) => a.name).join(", ")}>
                      {s.name}
                    </span>
                    <button className="btn-icon size-7" title="Sao chép link" onClick={() => copy(shareUrl(s.token), toast)}>
                      <Copy size={14} />
                    </button>
                    <button
                      className={cn("btn-icon size-7", s.disabled && "text-err")}
                      title={s.disabled ? "Bật lại link" : "Tắt link (khách không vào được)"}
                      onClick={() => patch(s, { disabled: !s.disabled })}
                    >
                      <Power size={14} />
                    </button>
                    <button className="btn-icon size-7 hover:text-err" title="Xoá link" onClick={() => remove(s)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mut">
                    <span>{s.assets.length} file</span>
                    {s.hasPassword && (
                      <span className="inline-flex items-center gap-1">
                        <Lock size={11} /> Có mật khẩu
                      </span>
                    )}
                    {s.expiresAt && (
                      <span className={cn("inline-flex items-center gap-1", expired && "text-err")}>
                        <Clock size={11} /> {expired ? "Đã hết hạn" : `Hết hạn ${new Date(s.expiresAt).toLocaleDateString("vi-VN")}`}
                      </span>
                    )}
                    {s.disabled && <span className="text-err">Đã tắt</span>}
                    <span className="inline-flex items-center gap-1">
                      <Eye size={11} /> {s.viewCount} lượt xem{s.lastViewedAt ? ` · ${timeAgo(s.lastViewedAt)}` : ""}
                    </span>
                    <span>
                      {[s.allowComment && "comment", s.allowApprove && "duyệt", s.allowDownload && "tải gốc"].filter(Boolean).join(", ") || "chỉ xem"}
                    </span>
                    <span className="text-dim">
                      {s.createdBy ?? "?"} · {timeAgo(s.createdAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {confirmNode}
    </Modal>
  );
}
