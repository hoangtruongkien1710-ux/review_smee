"use client";

// Chọn nơi chuyển file / thư mục tới: project bất kỳ (bạn có quyền chỉnh sửa) rồi thư mục trong project đó.
import { useEffect, useMemo, useState } from "react";
import { Modal, api } from "./ui";
import { cn } from "@/lib/utils";

type F = { id: string; name: string; parentId: string | null };
type P = { id: string; name: string; color: string; folders: F[] };

export type MoveTarget = { projectId: string; folderId: string | null; projectName: string };

export function MoveModal({
  open,
  title,
  currentProjectId,
  /** Thư mục không được chọn làm đích (đang chuyển thư mục: chính nó và thư mục con) */
  excludeFolderId = null,
  onClose,
  onMove,
}: {
  open: boolean;
  title: string;
  currentProjectId: string;
  excludeFolderId?: string | null;
  onClose: () => void;
  onMove: (t: MoveTarget) => void;
}) {
  const [projects, setProjects] = useState<P[] | null>(null);
  const [err, setErr] = useState("");
  const [projectId, setProjectId] = useState(currentProjectId);
  const [folderId, setFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(currentProjectId);
    setFolderId(null);
    setErr("");
    api<{ projects: P[] }>("/api/move-targets")
      .then((r) => setProjects(r.projects))
      .catch((e) => setErr((e as Error).message));
  }, [open, currentProjectId]);

  const project = projects?.find((p) => p.id === projectId) ?? null;

  const rows = useMemo(() => {
    const out: { f: F | null; depth: number }[] = [{ f: null, depth: 0 }];
    if (!project) return out;
    const banned = new Set<string>();
    if (excludeFolderId && project.id === currentProjectId) {
      banned.add(excludeFolderId);
      for (let grew = true; grew; ) {
        grew = false;
        for (const f of project.folders) if (f.parentId && banned.has(f.parentId) && !banned.has(f.id)) (banned.add(f.id), (grew = true));
      }
    }
    const walk = (parent: string | null, depth: number) => {
      for (const f of project.folders.filter((x) => x.parentId === parent && !banned.has(x.id)).sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
        out.push({ f, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    return out;
  }, [project, excludeFolderId, currentProjectId]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <label className="mb-1 block text-xs font-medium text-dim">Project đích</label>
      <select
        className="input mb-3"
        value={projectId}
        disabled={!projects}
        onChange={(e) => {
          setProjectId(e.target.value);
          setFolderId(null);
        }}
      >
        {!projects && <option>Đang tải…</option>}
        {projects?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.id === currentProjectId ? " (project hiện tại)" : ""}
          </option>
        ))}
      </select>
      <label className="mb-1 block text-xs font-medium text-dim">Thư mục đích</label>
      <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-line p-1">
        {rows.map(({ f, depth }) => (
          <button
            key={f?.id ?? "root"}
            onClick={() => setFolderId(f?.id ?? null)}
            className={cn(
              "flex w-full items-center rounded-md py-1.5 pr-2 text-left text-sm",
              folderId === (f?.id ?? null) ? "bg-accent/15 text-fg" : "text-mut hover:bg-panel-2",
            )}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            {f ? f.name : "Thư mục gốc của project"}
          </button>
        ))}
      </div>
      {project && project.id !== currentProjectId && (
        <p className="mb-3 text-xs text-warn">
          Chuyển sang project khác: comment và phiên bản đi theo file. Link chia sẻ khách đang dùng cho file/thư mục này sẽ bị gỡ.
        </p>
      )}
      {err && <p className="mb-3 text-sm text-err">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Huỷ
        </button>
        <button className="btn-primary" disabled={!project} onClick={() => project && onMove({ projectId: project.id, folderId, projectName: project.name })}>
          Di chuyển
        </button>
      </div>
    </Modal>
  );
}
