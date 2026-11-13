"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  List,
  Search,
  MoreHorizontal,
  Pencil,
  Download,
  FolderInput,
  Trash2,
  RotateCcw,
  Layers,
  MessageSquare,
  Check,
  X,
  UploadCloud,
  CloudOff,
  Share2,
} from "lucide-react";
import type { AssetDTO } from "@/lib/asset-dto";
import { STATUSES } from "@/lib/statuses";
import { cn, formatBytes, timeAgo } from "@/lib/utils";
import { Menu, MenuItem, Modal, api, useConfirm, useToast } from "./ui";
import { AssetThumb, KindIcon, formatDuration } from "./AssetThumb";
import { StatusPill } from "./StatusPill";
import { useUploads } from "./UploadManager";
import { ShareModal } from "./ShareModal";

type F = { id: string; name: string; parentId: string | null };
type Sort = "new" | "old" | "name" | "size";

export function AssetBrowser({
  projectId,
  assets,
  folders,
  canEdit,
  trash,
  folderLabel,
  currentFolderId,
}: {
  projectId: string;
  assets: AssetDTO[];
  folders: F[];
  canEdit: boolean;
  trash: boolean;
  folderLabel: string;
  currentFolderId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const uploads = useUploads();
  const { confirm, node: confirmNode } = useConfirm();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shareIds, setShareIds] = useState<string[] | null>(null);
  const [rename, setRename] = useState<AssetDTO | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const versionInput = useRef<HTMLInputElement>(null);
  const versionTarget = useRef<AssetDTO | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("sr.assets.view") === "list") setView("list");
    } catch {}
  }, []);
  useEffect(() => setSelected(new Set()), [currentFolderId, trash]);

  // Tự làm mới khi còn file đang xử lý
  const processing = assets.some((a) => a.version && ["QUEUED", "PROCESSING", "UPLOADING"].includes(a.version.status));
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [processing, router]);

  // Upload xong → làm mới danh sách
  useEffect(() => uploads.onFinished((it) => it.projectId === projectId && router.refresh()), [uploads, projectId, router]);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const xs = assets.filter((a) => (!k || a.name.toLowerCase().includes(k)) && (!statusFilter || a.status === statusFilter));
    return xs.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "vi", { numeric: true });
      if (sort === "size") return (b.version?.size ?? 0) - (a.version?.size ?? 0);
      if (sort === "old") return a.createdAt.localeCompare(b.createdAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [assets, q, statusFilter, sort]);

  const totalSize = assets.reduce((s, a) => s + (a.version?.size ?? 0), 0);
  const allSelected = list.length > 0 && list.every((a) => selected.has(a.id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function bulk(action: string, ids: string[], extra: object = {}, msg?: string) {
    try {
      await api("/api/assets/bulk", { body: { projectId, ids, action, ...extra } });
      if (msg) toast(msg);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  async function trashIds(ids: string[]) {
    await bulk("trash", ids, {}, `Đã chuyển ${ids.length} file vào thùng rác`);
  }
  async function deleteForever(ids: string[]) {
    const ok = await confirm(
      "Xoá vĩnh viễn?",
      `${ids.length} file sẽ bị xoá hẳn khỏi app, kèm toàn bộ phiên bản và comment. File gốc trên Google Drive được chuyển vào Thùng rác của Drive (khôi phục được trong 30 ngày).`,
      "Xoá vĩnh viễn",
    );
    if (ok) await bulk("delete", ids, {}, "Đã xoá vĩnh viễn");
  }
  async function setStatus(ids: string[], status: string) {
    await bulk("status", ids, { status });
  }
  async function retry(a: AssetDTO) {
    try {
      await api(`/api/assets/${a.id}/retry`, { method: "POST" });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  const href = (a: AssetDTO) => `/projects/${projectId}/assets/${a.id}`;

  const menu = (a: AssetDTO) => (
    <Menu
      trigger={() => (
        <button className="btn-icon size-7" aria-label="Tuỳ chọn">
          <MoreHorizontal size={15} />
        </button>
      )}
    >
      {(close) =>
        trash ? (
          <>
            <MenuItem icon={<RotateCcw size={15} />} onClick={() => (close(), bulk("restore", [a.id], {}, "Đã khôi phục"))}>
              Khôi phục
            </MenuItem>
            <MenuItem danger icon={<Trash2 size={15} />} onClick={() => (close(), deleteForever([a.id]))}>
              Xoá vĩnh viễn
            </MenuItem>
          </>
        ) : (
          <>
            {a.version && (
              <MenuItem
                icon={<Download size={15} />}
                onClick={() => {
                  close();
                  window.location.href = `/api/files/${a.version!.id}/original`;
                }}
              >
                Tải file gốc
              </MenuItem>
            )}
            {canEdit && (
              <>
                <MenuItem icon={<Share2 size={15} />} onClick={() => (close(), setShareIds([a.id]))}>
                  Chia sẻ cho khách
                </MenuItem>
                <MenuItem
                  icon={<Layers size={15} />}
                  onClick={() => {
                    close();
                    versionTarget.current = a;
                    versionInput.current?.click();
                  }}
                >
                  Upload phiên bản mới
                </MenuItem>
                <MenuItem icon={<Pencil size={15} />} onClick={() => (close(), setRename(a))}>
                  Đổi tên
                </MenuItem>
                <MenuItem icon={<FolderInput size={15} />} onClick={() => (close(), setMoveIds([a.id]))}>
                  Di chuyển
                </MenuItem>
                <MenuItem danger icon={<Trash2 size={15} />} onClick={() => (close(), trashIds([a.id]))}>
                  Xoá
                </MenuItem>
              </>
            )}
          </>
        )
      }
    </Menu>
  );

  const checkbox = (a: AssetDTO, cls = "") => (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(a.id);
      }}
      className={cn(
        "flex size-5 items-center justify-center rounded border",
        selected.has(a.id) ? "border-accent bg-accent text-white" : "border-white/60 bg-black/40 text-transparent hover:border-white",
        cls,
      )}
      aria-label="Chọn"
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );

  return (
    <div>
      {/* Thanh công cụ */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {selected.size > 0 ? (
          <div className="flex flex-1 flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1">
            <button className="btn-icon size-7" onClick={() => setSelected(new Set())} title="Bỏ chọn">
              <X size={15} />
            </button>
            <span className="mr-2 text-sm font-medium">Đã chọn {selected.size}</span>
            {trash ? (
              canEdit && (
                <>
                  <button className="btn-ghost h-8" onClick={() => bulk("restore", [...selected], {}, "Đã khôi phục")}>
                    <RotateCcw size={15} /> Khôi phục
                  </button>
                  <button className="btn-ghost h-8 text-err" onClick={() => deleteForever([...selected])}>
                    <Trash2 size={15} /> Xoá vĩnh viễn
                  </button>
                </>
              )
            ) : (
              canEdit && (
                <>
                  <Menu
                    align="left"
                    trigger={() => <button className="btn-ghost h-8">Đổi trạng thái</button>}
                  >
                    {(close) =>
                      STATUSES.map((s) => (
                        <MenuItem
                          key={s.key}
                          icon={<span className="block size-2 rounded-full" style={{ background: s.color }} />}
                          onClick={() => (close(), setStatus([...selected], s.key))}
                        >
                          {s.label}
                        </MenuItem>
                      ))
                    }
                  </Menu>
                  <button className="btn-ghost h-8" onClick={() => setShareIds([...selected])}>
                    <Share2 size={15} /> Chia sẻ
                  </button>
                  <button className="btn-ghost h-8" onClick={() => setMoveIds([...selected])}>
                    <FolderInput size={15} /> Di chuyển
                  </button>
                  <button className="btn-ghost h-8 text-err" onClick={() => trashIds([...selected])}>
                    <Trash2 size={15} /> Xoá
                  </button>
                </>
              )
            )}
          </div>
        ) : (
          <>
            <div className="mr-auto text-sm text-mut">
              {assets.length} file · {formatBytes(totalSize)}
              {trash && <span className="ml-2 text-xs text-dim">File trong thùng rác có thể khôi phục.</span>}
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <input className="input h-8 w-48 pl-8" placeholder="Tìm trong thư mục…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input h-8 w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Mọi trạng thái</option>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <select className="input h-8 w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="new">Mới nhất</option>
              <option value="old">Cũ nhất</option>
              <option value="name">Tên A–Z</option>
              <option value="size">Dung lượng</option>
            </select>
          </>
        )}
        {list.length > 0 && (
          <button
            className="btn-ghost h-8 px-2 text-xs"
            onClick={() => setSelected(allSelected ? new Set() : new Set(list.map((a) => a.id)))}
          >
            {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
          </button>
        )}
        <div className="flex rounded-lg border border-line bg-panel p-0.5">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              className={cn("btn-icon size-7", view === v && "bg-panel-2 text-fg")}
              onClick={() => {
                setView(v);
                try {
                  localStorage.setItem("sr.assets.view", v);
                } catch {}
              }}
              title={v === "grid" ? "Dạng lưới" : "Dạng bảng"}
            >
              {v === "grid" ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 py-16 text-center text-mut">
          {trash ? (
            <p className="text-sm">Thùng rác trống.</p>
          ) : assets.length ? (
            <p className="text-sm">Không có file nào khớp bộ lọc.</p>
          ) : (
            <>
              <UploadCloud size={28} className="text-dim" />
              <p className="text-sm">Chưa có file trong {folderLabel}.</p>
              {canEdit && <p className="text-xs text-dim">Kéo thả file vào đây hoặc bấm nút Upload.</p>}
            </>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {list.map((a) => {
            const sel = selected.has(a.id);
            const Card = trash ? "div" : Link;
            return (
              <Card
                key={a.id}
                href={href(a)}
                className={cn(
                  "card group overflow-hidden transition-colors",
                  sel ? "border-accent ring-1 ring-accent" : "hover:border-line-2",
                )}
              >
                <div className="relative">
                  <AssetThumb asset={a} onRetry={canEdit ? () => retry(a) : undefined} />
                  <div className={cn("absolute left-1.5 top-1.5", !sel && "opacity-0 group-hover:opacity-100", a.versionCount > 1 && !sel && "group-hover:opacity-100")}>
                    {checkbox(a)}
                  </div>
                </div>
                <div className="px-3 pb-2.5 pt-2">
                  <div className="flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" title={a.name}>
                        {a.name}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-mut">
                        {a.version?.uploadedBy ?? a.createdBy ?? "?"} · {timeAgo(a.createdAt)}
                      </div>
                    </div>
                    <div onClick={(e) => e.preventDefault()}>{menu(a)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                    <StatusPill value={a.status} onChange={canEdit && !trash ? (s) => setStatus([a.id], s) : undefined} />
                    <span className="ml-auto flex items-center gap-2 text-xs text-dim">
                      {a.commentCount > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare size={12} /> {a.commentCount}
                        </span>
                      )}
                      {a.version && !a.version.onDrive && a.version.status === "READY" && (
                        <span title="File gốc chưa lên Google Drive">
                          <CloudOff size={12} />
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-mut">
              <tr className="border-b border-line">
                <th className="w-10 px-3 py-2.5" />
                <th className="px-3 py-2.5 font-medium">Tên</th>
                <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                <th className="px-3 py-2.5 font-medium">Thời lượng</th>
                <th className="px-3 py-2.5 font-medium">Dung lượng</th>
                <th className="px-3 py-2.5 font-medium">Người upload</th>
                <th className="px-3 py-2.5 font-medium">Ngày</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className={cn("border-b border-line last:border-0 hover:bg-panel-2", selected.has(a.id) && "bg-accent/5")}>
                  <td className="px-3 py-2">{checkbox(a, "border-line-2")}</td>
                  <td className="px-3 py-2">
                    {trash ? (
                      <span className="flex items-center gap-2.5">
                        <span className="text-mut">
                          <KindIcon asset={a} size={18} />
                        </span>
                        {a.name}
                      </span>
                    ) : (
                      <Link href={href(a)} className="flex items-center gap-2.5 font-medium hover:text-accent">
                        <span className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-black text-mut">
                          {a.version?.hasThumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/files/${a.version.id}/thumb`} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <KindIcon asset={a} size={16} />
                          )}
                        </span>
                        <span className="truncate">{a.name}</span>
                        {a.versionCount > 1 && <span className="rounded bg-accent px-1 text-[10px] font-bold text-white">V{a.version?.versionNo}</span>}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill value={a.status} onChange={canEdit && !trash ? (s) => setStatus([a.id], s) : undefined} />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-mut">{formatDuration(a.version?.durationSec)}</td>
                  <td className="px-3 py-2 text-mut">{formatBytes(a.version?.size ?? 0)}</td>
                  <td className="px-3 py-2 text-mut">{a.version?.uploadedBy ?? a.createdBy}</td>
                  <td className="px-3 py-2 text-mut">{timeAgo(a.createdAt)}</td>
                  <td className="px-2">{menu(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <input
        ref={versionInput}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          const a = versionTarget.current;
          if (f && a) uploads.add([f], { projectId, folderId: a.folderId, assetId: a.id, label: a.name });
          e.target.value = "";
        }}
      />

      <Modal open={!!rename} onClose={() => setRename(null)} title="Đổi tên file">
        {rename && (
          <RenameForm
            key={rename.id}
            asset={rename}
            onDone={() => {
              setRename(null);
              router.refresh();
            }}
            onCancel={() => setRename(null)}
          />
        )}
      </Modal>
      <MoveModal
        ids={moveIds}
        folders={folders}
        onClose={() => setMoveIds(null)}
        onMove={async (folderId) => {
          const ids = moveIds!;
          setMoveIds(null);
          await bulk("move", ids, { folderId }, `Đã di chuyển ${ids.length} file`);
        }}
      />
      <ShareModal
        open={!!shareIds}
        onClose={() => {
          setShareIds(null);
          setSelected(new Set());
        }}
        projectId={projectId}
        assets={(shareIds ?? []).map((id) => assets.find((a) => a.id === id)).filter((a): a is AssetDTO => !!a).map((a) => ({ id: a.id, name: a.name }))}
      />
      {confirmNode}
    </div>
  );
}

function RenameForm({ asset, onDone, onCancel }: { asset: AssetDTO; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(asset.name);
  const [err, setErr] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/api/assets/${asset.id}`, { method: "PATCH", body: { name } });
          onDone();
        } catch (e) {
          setErr((e as Error).message);
        }
      }}
    >
      <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      {err && <p className="mb-3 text-sm text-err">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Huỷ
        </button>
        <button className="btn-primary">Lưu</button>
      </div>
    </form>
  );
}

function MoveModal({
  ids,
  folders,
  onClose,
  onMove,
}: {
  ids: string[] | null;
  folders: F[];
  onClose: () => void;
  onMove: (folderId: string | null) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const rows: { f: F | null; depth: number }[] = [{ f: null, depth: 0 }];
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => x.parentId === parent).sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
      rows.push({ f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return (
    <Modal open={!!ids} onClose={onClose} title={`Di chuyển ${ids?.length ?? 0} file tới…`}>
      <div className="mb-4 max-h-72 overflow-y-auto rounded-lg border border-line p-1">
        {rows.map(({ f, depth }) => (
          <button
            key={f?.id ?? "root"}
            onClick={() => setTarget(f?.id ?? null)}
            className={cn(
              "flex w-full items-center rounded-md py-1.5 pr-2 text-left text-sm",
              target === (f?.id ?? null) ? "bg-accent/15 text-fg" : "text-mut hover:bg-panel-2",
            )}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            {f ? f.name : "Thư mục gốc của project"}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Huỷ
        </button>
        <button className="btn-primary" onClick={() => onMove(target)}>
          Di chuyển
        </button>
      </div>
    </Modal>
  );
}
