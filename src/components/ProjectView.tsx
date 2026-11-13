"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  UploadCloud,
  Plus,
  Trash2 as TrashIcon,
  Share2,
} from "lucide-react";
import { AssetBrowser } from "./AssetBrowser";
import { useUploads } from "./UploadManager";
import type { AssetDTO } from "@/lib/asset-dto";
import { Avatar, Menu, MenuItem, Modal, api, useConfirm, useToast } from "./ui";
import { MembersModal, type Member } from "./MembersModal";
import { ShareModal } from "./ShareModal";
import { cn } from "@/lib/utils";

type ProjectRole = "MANAGER" | "EDITOR" | "COMMENTER" | "VIEWER";
type F = { id: string; name: string; parentId: string | null };

export function ProjectView({
  project,
  role,
  folders,
  members,
  currentFolderId,
  assets,
  trash,
  trashCount,
}: {
  project: { id: string; name: string; description: string; color: string; archived: boolean };
  role: ProjectRole;
  folders: F[];
  members: Member[];
  currentFolderId: string | null;
  assets: AssetDTO[];
  trash: boolean;
  trashCount: number;
}) {
  const uploads = useUploads();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const router = useRouter();
  const toast = useToast();
  const { confirm, node: confirmNode } = useConfirm();
  const canEdit = role === "MANAGER" || role === "EDITOR";
  const [folderModal, setFolderModal] = useState<{ mode: "new"; parentId: string | null } | { mode: "rename"; folder: F } | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showShares, setShowShares] = useState(false);
  const [shareFolder, setShareFolder] = useState<F | null>(null);

  const byParent = useMemo(() => {
    const m = new Map<string | null, F[]>();
    for (const f of folders) {
      const k = f.parentId;
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    return m;
  }, [folders]);

  const path = useMemo(() => {
    const out: F[] = [];
    let cur = folders.find((f) => f.id === currentFolderId) ?? null;
    while (cur) {
      out.unshift(cur);
      cur = folders.find((f) => f.id === cur!.parentId) ?? null;
    }
    return out;
  }, [folders, currentFolderId]);

  const [open, setOpen] = useState<Set<string>>(() => new Set(path.map((f) => f.id)));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const href = (fid: string | null) => `/projects/${project.id}${fid ? `?folder=${fid}` : ""}`;
  const children = byParent.get(currentFolderId) ?? [];

  function queueFiles(files: File[]) {
    const label = path.length ? `${project.name} › ${path[path.length - 1].name}` : project.name;
    uploads.add(files, { projectId: project.id, folderId: currentFolderId, label });
  }

  async function removeFolder(f: F) {
    const ok = await confirm(
      "Xoá thư mục?",
      `Thư mục "${f.name}" và các thư mục con sẽ bị xoá. File bên trong được chuyển vào thùng rác của project.`,
    );
    if (!ok) return;
    try {
      await api(`/api/folders/${f.id}`, { method: "DELETE" });
      toast("Đã xoá thư mục");
      if (path.some((p) => p.id === f.id)) router.push(href(f.parentId));
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  const folderMenu = (f: F) =>
    canEdit && (
      <Menu
        trigger={() => (
          <span className="btn-icon size-6" role="button" aria-label="Tuỳ chọn thư mục">
            <MoreHorizontal size={14} />
          </span>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={<FolderPlus size={15} />} onClick={() => (close(), setFolderModal({ mode: "new", parentId: f.id }))}>
              Tạo thư mục con
            </MenuItem>
            <MenuItem icon={<Pencil size={15} />} onClick={() => (close(), setFolderModal({ mode: "rename", folder: f }))}>
              Đổi tên
            </MenuItem>
            <MenuItem icon={<Share2 size={15} />} onClick={() => (close(), setShareFolder(f))}>
              Chia sẻ thư mục cho khách
            </MenuItem>
            <MenuItem danger icon={<Trash2 size={15} />} onClick={() => (close(), removeFolder(f))}>
              Xoá thư mục
            </MenuItem>
          </>
        )}
      </Menu>
    );

  const renderTree = (parentId: string | null, depth: number): React.ReactNode => {
    const items = byParent.get(parentId) ?? [];
    return (
      <>
        {items.map((f) => {
          const hasKids = (byParent.get(f.id) ?? []).length > 0;
          const isOpen = open.has(f.id);
          const active = f.id === currentFolderId;
          return (
            <div key={f.id}>
              <div
                className={cn(
                  "group flex h-8 items-center gap-1 rounded-md pr-1 text-sm",
                  active ? "bg-accent/15 text-fg" : "text-mut hover:bg-panel-2 hover:text-fg",
                )}
                style={{ paddingLeft: 4 + depth * 14 }}
              >
                <button
                  className={cn("flex size-5 items-center justify-center rounded text-dim", !hasKids && "invisible")}
                  onClick={() => toggle(f.id)}
                  aria-label={isOpen ? "Thu gọn" : "Mở rộng"}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <Link href={href(f.id)} className="flex min-w-0 flex-1 items-center gap-2" onClick={() => setOpen((s) => new Set(s).add(f.id))}>
                  <FolderIcon size={15} className={active ? "text-accent" : ""} />
                  <span className="truncate">{f.name}</span>
                </Link>
                <span className="opacity-0 group-hover:opacity-100">{folderMenu(f)}</span>
              </div>
              {hasKids && isOpen && renderTree(f.id, depth + 1)}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="flex h-full">
      {/* Sidebar project */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
        <div className="border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: project.color }} />
            <h1 className="truncate font-semibold" title={project.name}>
              {project.name}
            </h1>
          </div>
          <button onClick={() => setShowMembers(true)} className="mt-2 flex items-center gap-1.5 text-xs text-mut hover:text-fg">
            <div className="flex -space-x-1.5">
              {members.slice(0, 4).map((m) => (
                <Avatar key={m.id} name={m.name} color={m.color} size={20} className="ring-2 ring-panel" />
              ))}
            </div>
            {members.length} thành viên
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-1 flex items-center justify-between px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-dim">
            File
            {canEdit && (
              <button className="btn-icon size-6" title="Tạo thư mục" onClick={() => setFolderModal({ mode: "new", parentId: null })}>
                <Plus size={14} />
              </button>
            )}
          </div>
          <Link
            href={href(null)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-sm",
              currentFolderId === null && !trash ? "bg-accent/15 text-fg" : "text-mut hover:bg-panel-2 hover:text-fg",
            )}
          >
            <FolderIcon size={15} className={currentFolderId === null && !trash ? "text-accent" : ""} />
            Thư mục gốc
          </Link>
          {renderTree(null, 0)}
          <div className="my-2 border-t border-line" />
          <Link
            href={`/projects/${project.id}?view=trash`}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-sm",
              trash ? "bg-accent/15 text-fg" : "text-mut hover:bg-panel-2 hover:text-fg",
            )}
          >
            <TrashIcon size={15} />
            Thùng rác
            {trashCount > 0 && <span className="ml-auto text-xs text-dim">{trashCount}</span>}
          </Link>
        </div>
      </aside>

      {/* Nội dung */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
          <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-mut">
            <Link href="/" className="hover:text-fg">
              Projects
            </Link>
            <ChevronRight size={14} />
            <Link href={href(null)} className={cn("truncate hover:text-fg", !path.length && "text-fg")}>
              {project.name}
            </Link>
            {trash && (
              <span className="flex items-center gap-1">
                <ChevronRight size={14} />
                <span className="text-fg">Thùng rác</span>
              </span>
            )}
            {path.map((f, i) => (
              <span key={f.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight size={14} />
                <Link href={href(f.id)} className={cn("truncate hover:text-fg", i === path.length - 1 && "text-fg")}>
                  {f.name}
                </Link>
              </span>
            ))}
          </nav>
          {canEdit && (
            <button className="btn-outline" onClick={() => setShowShares(true)} title="Các link đã chia sẻ cho khách">
              <Share2 size={15} /> Link chia sẻ
            </button>
          )}
          <button className="btn-outline" onClick={() => setShowMembers(true)}>
            <Users size={15} /> Thành viên
          </button>
          {canEdit && !trash && (
            <button className="btn-outline" onClick={() => setFolderModal({ mode: "new", parentId: currentFolderId })}>
              <FolderPlus size={15} /> Thư mục
            </button>
          )}
          {canEdit && !trash && (
            <button className="btn-primary" onClick={() => fileInput.current?.click()}>
              <UploadCloud size={15} /> Upload
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) queueFiles(files);
              e.target.value = "";
            }}
          />
        </header>

        <div
          className="relative flex-1 overflow-y-auto p-5"
          onDragEnter={(e) => {
            if (!canEdit || trash || !e.dataTransfer.types.includes("Files")) return;
            dragDepth.current++;
            setDragging(true);
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (!dragDepth.current) setDragging(false);
          }}
          onDragOver={(e) => {
            if (canEdit && !trash && e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!canEdit || trash) return;
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            const files = Array.from(e.dataTransfer.files).filter((f) => f.size > 0 || f.type);
            if (files.length) queueFiles(files);
          }}
        >
          {!trash && children.length > 0 && (
            <>
              <div className="mb-2 text-xs font-medium text-mut">Thư mục</div>
              <div className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                {children.map((f) => (
                  <Link
                    key={f.id}
                    href={href(f.id)}
                    className="card group flex items-center gap-3 px-3.5 py-3 hover:border-line-2"
                  >
                    <FolderIcon size={20} className="text-accent" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                    <span className="opacity-0 group-hover:opacity-100" onClick={(e) => e.preventDefault()}>
                      {folderMenu(f)}
                    </span>
                  </Link>
                ))}
              </div>
              <div className="mb-2 text-xs font-medium text-mut">File</div>
            </>
          )}
          <AssetBrowser
            projectId={project.id}
            assets={assets}
            folders={folders}
            canEdit={canEdit}
            trash={trash}
            folderLabel={path.length ? `thư mục "${path[path.length - 1].name}"` : "thư mục gốc"}
            currentFolderId={currentFolderId}
          />
          {dragging && (
            <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
              <div className="rounded-2xl border-2 border-dashed border-accent bg-panel/90 px-10 py-8 text-center">
                <UploadCloud size={36} className="mx-auto mb-2 text-accent" />
                <div className="font-medium">Thả file để upload</div>
                <div className="text-sm text-mut">vào {path.length ? path[path.length - 1].name : project.name}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <FolderModal
        state={folderModal}
        projectId={project.id}
        onClose={() => setFolderModal(null)}
        onDone={(newId) => {
          setFolderModal(null);
          router.refresh();
          if (newId && folderModal?.mode === "new" && folderModal.parentId)
            setOpen((s) => new Set(s).add(folderModal.parentId!));
        }}
      />
      <ShareModal open={showShares} onClose={() => setShowShares(false)} projectId={project.id} assets={[]} />
      <ShareModal
        open={!!shareFolder}
        onClose={() => setShareFolder(null)}
        projectId={project.id}
        assets={[]}
        folders={shareFolder ? [{ id: shareFolder.id, name: shareFolder.name }] : []}
      />
      <MembersModal open={showMembers} onClose={() => setShowMembers(false)} projectId={project.id} members={members} canManage={role === "MANAGER"} />
      {confirmNode}
    </div>
  );
}

function FolderModal({
  state,
  projectId,
  onClose,
  onDone,
}: {
  state: { mode: "new"; parentId: string | null } | { mode: "rename"; folder: F } | null;
  projectId: string;
  onClose: () => void;
  onDone: (newId?: string) => void;
}) {
  return (
    <Modal open={!!state} onClose={onClose} title={state?.mode === "rename" ? "Đổi tên thư mục" : "Tạo thư mục"}>
      {state && <FolderForm key={state.mode === "rename" ? state.folder.id : "new"} state={state} projectId={projectId} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function FolderForm({
  state,
  projectId,
  onClose,
  onDone,
}: {
  state: { mode: "new"; parentId: string | null } | { mode: "rename"; folder: F };
  projectId: string;
  onClose: () => void;
  onDone: (newId?: string) => void;
}) {
  const [name, setName] = useState(state.mode === "rename" ? state.folder.name : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          if (state.mode === "rename") {
            await api(`/api/folders/${state.folder.id}`, { method: "PATCH", body: { name } });
            onDone();
          } else {
            const r = await api<{ id: string }>("/api/folders", { body: { projectId, parentId: state.parentId, name } });
            onDone(r.id);
          }
        } catch (e) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <label className="label">Tên thư mục</label>
      <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      {err && <p className="mb-3 text-sm text-err">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Huỷ
        </button>
        <button className="btn-primary" disabled={busy}>
          {state.mode === "rename" ? "Lưu" : "Tạo"}
        </button>
      </div>
    </form>
  );
}
