"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Plus, MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2, Search, Users } from "lucide-react";
import { Modal, Menu, MenuItem, api, useConfirm, useToast } from "./ui";
import { cn, formatBytes, formatDate, timeAgo } from "@/lib/utils";

export type ProjectRow = {
  id: string;
  name: string;
  description: string;
  color: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  assetCount: number;
  memberCount: number;
  size: number;
};

type Sort = "updated" | "name" | "created";

export function ProjectsView({ projects, canCreate }: { projects: ProjectRow[]; canCreate: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, node: confirmNode } = useConfirm();
  const [view, setView] = useState<"grid" | "list">("grid");
  useEffect(() => {
    try {
      if (localStorage.getItem("sr.projects.view") === "list") setView("list");
    } catch {}
  }, []);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [sort, setSort] = useState<Sort>("updated");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProjectRow | "new" | null>(null);

  const list = useMemo(() => {
    const filtered = projects.filter(
      (p) => (tab === "archived" ? p.archived : !p.archived) && p.name.toLowerCase().includes(q.trim().toLowerCase()),
    );
    return filtered.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "vi")
        : sort === "created"
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [projects, tab, sort, q]);

  function setViewSaved(v: "grid" | "list") {
    setView(v);
    try {
      localStorage.setItem("sr.projects.view", v);
    } catch {}
  }

  async function archive(p: ProjectRow) {
    try {
      await api(`/api/projects/${p.id}`, { method: "PATCH", body: { archived: !p.archived } });
      toast(p.archived ? "Đã khôi phục project" : "Đã lưu trữ project");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  async function remove(p: ProjectRow) {
    const ok = await confirm(
      "Xoá project?",
      `Project "${p.name}" cùng toàn bộ thư mục, file và comment sẽ bị xoá vĩnh viễn. Không thể hoàn tác.`,
      "Xoá vĩnh viễn",
    );
    if (!ok) return;
    try {
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      toast("Đã xoá project");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  const menu = (p: ProjectRow) => (
    <Menu
      trigger={() => (
        <button className="btn-icon" aria-label="Thêm">
          <MoreHorizontal size={16} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={<Pencil size={15} />} onClick={() => (close(), setEditing(p))}>
            Đổi tên / mô tả
          </MenuItem>
          <MenuItem icon={p.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} onClick={() => (close(), archive(p))}>
            {p.archived ? "Khôi phục" : "Lưu trữ"}
          </MenuItem>
          <MenuItem danger icon={<Trash2 size={15} />} onClick={() => (close(), remove(p))}>
            Xoá project
          </MenuItem>
        </>
      )}
    </Menu>
  );

  const activeCount = projects.filter((p) => !p.archived).length;
  const archivedCount = projects.length - activeCount;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-xl font-semibold">Projects</h1>
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="input w-56 pl-8" placeholder="Tìm project…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {canCreate && (
            <button className="btn-primary" onClick={() => setEditing("new")}>
              <Plus size={16} /> Project mới
            </button>
          )}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-panel p-0.5 text-sm">
            {(
              [
                ["active", `Đang hoạt động (${activeCount})`],
                ["archived", `Lưu trữ (${archivedCount})`],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn("rounded-md px-3 py-1.5", tab === k ? "bg-panel-2 text-fg" : "text-mut hover:text-fg")}
              >
                {l}
              </button>
            ))}
          </div>
          <select className="input ml-auto w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="updated">Mới cập nhật</option>
            <option value="name">Tên A–Z</option>
            <option value="created">Ngày tạo</option>
          </select>
          <div className="flex rounded-lg border border-line bg-panel p-0.5">
            <button className={cn("btn-icon", view === "grid" && "bg-panel-2 text-fg")} onClick={() => setViewSaved("grid")} title="Dạng lưới">
              <LayoutGrid size={16} />
            </button>
            <button className={cn("btn-icon", view === "list" && "bg-panel-2 text-fg")} onClick={() => setViewSaved("list")} title="Dạng bảng">
              <List size={16} />
            </button>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-mut">
              {q ? "Không có project nào khớp." : tab === "archived" ? "Chưa có project nào được lưu trữ." : "Chưa có project nào."}
            </p>
            {canCreate && tab === "active" && !q && (
              <button className="btn-primary" onClick={() => setEditing("new")}>
                <Plus size={16} /> Tạo project đầu tiên
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
            {list.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="card group overflow-hidden transition-colors hover:border-line-2">
                <div
                  className="relative flex aspect-video items-end p-3"
                  style={{ background: `linear-gradient(135deg, ${p.color}55, ${p.color}10 60%, #15171c)` }}
                >
                  <span className="text-4xl font-bold text-white/80">{p.name.slice(0, 1).toUpperCase()}</span>
                  <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.preventDefault()}>
                    {menu(p)}
                  </div>
                </div>
                <div className="px-3.5 py-3">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-mut">
                    <span>{p.assetCount} file</span>·<span>{formatBytes(p.size)}</span>·<span>Cập nhật {timeAgo(p.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            ))}
            {canCreate && tab === "active" && (
              <button
                onClick={() => setEditing("new")}
                className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 text-mut hover:border-accent hover:text-accent"
              >
                <Plus size={22} /> Project mới
              </button>
            )}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-mut">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Cập nhật</th>
                  <th className="px-4 py-2.5 font-medium">Dung lượng</th>
                  <th className="px-4 py-2.5 font-medium">Thành viên</th>
                  <th className="px-4 py-2.5 font-medium">Ngày tạo</th>
                  <th className="px-4 py-2.5 font-medium">Trạng thái</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-panel-2">
                    <td className="px-4 py-2.5">
                      <Link href={`/projects/${p.id}`} className="flex items-center gap-2.5 font-medium hover:text-accent">
                        <span className="size-7 shrink-0 rounded-md" style={{ background: p.color }} />
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-mut">{timeAgo(p.updatedAt)}</td>
                    <td className="px-4 py-2.5 text-mut">
                      {formatBytes(p.size)} · {p.assetCount} file
                    </td>
                    <td className="px-4 py-2.5 text-mut">
                      <span className="inline-flex items-center gap-1">
                        <Users size={13} /> {p.memberCount}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-mut">{formatDate(p.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", p.archived ? "bg-line text-mut" : "bg-ok/15 text-ok")}>
                        {p.archived ? "Lưu trữ" : "Hoạt động"}
                      </span>
                    </td>
                    <td className="px-2">{menu(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProjectModal
        project={editing}
        onClose={() => setEditing(null)}
        onSaved={(id, isNew) => {
          setEditing(null);
          if (isNew) router.push(`/projects/${id}`);
          else router.refresh();
        }}
      />
      {confirmNode}
    </div>
  );
}

function ProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectRow | "new" | null;
  onClose: () => void;
  onSaved: (id: string, isNew: boolean) => void;
}) {
  const isNew = project === "new";
  const p = project && project !== "new" ? project : null;
  return (
    <Modal open={!!project} onClose={onClose} title={isNew ? "Tạo project mới" : "Sửa project"}>
      {project && <ProjectForm key={p?.id ?? "new"} p={p} onSaved={onSaved} onClose={onClose} />}
    </Modal>
  );
}

function ProjectForm({ p, onSaved, onClose }: { p: ProjectRow | null; onSaved: (id: string, isNew: boolean) => void; onClose: () => void }) {
  const [name, setName] = useState(p?.name ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          if (p) {
            await api(`/api/projects/${p.id}`, { method: "PATCH", body: { name, description } });
            onSaved(p.id, false);
          } else {
            const r = await api<{ id: string }>("/api/projects", { body: { name, description } });
            onSaved(r.id, true);
          }
        } catch (e) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <label className="label">Tên project</label>
      <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} autoFocus required placeholder="VD: TVC Tết 2027 - Khách hàng A" />
      <label className="label">Mô tả (không bắt buộc)</label>
      <textarea className="input mb-4" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      {err && <p className="mb-3 text-sm text-err">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Huỷ
        </button>
        <button className="btn-primary" disabled={busy}>
          {p ? "Lưu" : "Tạo project"}
        </button>
      </div>
    </form>
  );
}
