"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Avatar, Modal, api, useToast } from "./ui";

export type Member = {
  id: string;
  name: string;
  email: string;
  color: string;
  role: string; // vai trò hệ thống
  projectRole: "MANAGER" | "EDITOR" | "COMMENTER" | "VIEWER";
};

export const PROJECT_ROLES = [
  { key: "MANAGER", label: "Quản lý" },
  { key: "EDITOR", label: "Chỉnh sửa" },
  { key: "COMMENTER", label: "Chỉ comment" },
  { key: "VIEWER", label: "Chỉ xem" },
] as const;

type U = { id: string; name: string; email: string; color: string; role: string };

export function MembersModal({
  open,
  onClose,
  projectId,
  members,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [users, setUsers] = useState<U[]>([]);
  const [pick, setPick] = useState("");
  const [pickRole, setPickRole] = useState<Member["projectRole"]>("EDITOR");

  useEffect(() => {
    if (open && canManage) api<{ users: U[] }>("/api/users").then((r) => setUsers(r.users)).catch(() => {});
  }, [open, canManage]);

  const candidates = users.filter((u) => !members.some((m) => m.id === u.id) && u.role !== "OWNER" && u.role !== "ADMIN");

  async function setRole(userId: string, role: string) {
    try {
      await api(`/api/projects/${projectId}/members`, { method: "PUT", body: { userId, role } });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Thành viên project" width={520}>
      <p className="mb-4 text-xs text-mut">Chủ sở hữu và Admin luôn có quyền quản lý mọi project.</p>
      {canManage && (
        <div className="mb-4 flex gap-2">
          <select className="input flex-1" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Chọn người để thêm…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email}){u.role === "CLIENT" ? " · Khách hàng" : ""}
              </option>
            ))}
          </select>
          <select className="input w-36" value={pickRole} onChange={(e) => setPickRole(e.target.value as Member["projectRole"])}>
            {PROJECT_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            disabled={!pick}
            onClick={async () => {
              await setRole(pick, pickRole);
              setPick("");
            }}
          >
            Thêm
          </button>
        </div>
      )}
      <div className="max-h-80 divide-y divide-line overflow-y-auto">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={m.name} color={m.color} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{m.name}</div>
              <div className="truncate text-xs text-mut">{m.email}</div>
            </div>
            {canManage ? (
              <>
                <select className="input w-36" value={m.projectRole} onChange={(e) => setRole(m.id, e.target.value)}>
                  {PROJECT_ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-icon"
                  title="Xoá khỏi project"
                  onClick={async () => {
                    try {
                      await api(`/api/projects/${projectId}/members?userId=${m.id}`, { method: "DELETE" });
                      router.refresh();
                    } catch (e) {
                      toast((e as Error).message, "err");
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </>
            ) : (
              <span className="text-xs text-mut">{PROJECT_ROLES.find((r) => r.key === m.projectRole)?.label}</span>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
