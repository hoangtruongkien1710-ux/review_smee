"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Search, KeyRound, Ban, CheckCircle2, Pencil } from "lucide-react";
import { Avatar, Menu, MenuItem, Modal, PasswordInput, api, useToast } from "./ui";
import { cn, formatDate, timeAgo } from "@/lib/utils";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "CLIENT";
type U = {
  id: string;
  name: string;
  email: string;
  color: string;
  role: Role;
  status: "ACTIVE" | "DISABLED";
  lastActiveAt: string | null;
  createdAt: string;
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Chủ sở hữu",
  ADMIN: "Quản trị viên",
  MEMBER: "Thành viên",
  CLIENT: "Khách hàng",
};

export function UsersAdmin({ me, users }: { me: { id: string; role: Role }; users: U[] }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [modal, setModal] = useState<{ mode: "new" } | { mode: "edit"; u: U } | { mode: "password"; u: U } | null>(null);

  const list = useMemo(
    () =>
      users.filter(
        (u) =>
          (!roleFilter || u.role === roleFilter) &&
          (u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())),
      ),
    [users, q, roleFilter],
  );

  async function patch(u: U, body: object, msg: string) {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body });
      toast(msg);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-1 text-xs text-mut">Cài đặt</div>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-xl font-semibold">Thành viên</h1>
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="input w-60 pl-8" placeholder="Tìm theo tên, tên đăng nhập…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | Role)}>
            <option value="">Tất cả vai trò</option>
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={() => setModal({ mode: "new" })}>
            <Plus size={16} /> Thêm người dùng
          </button>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-mut">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-medium">Người dùng</th>
                <th className="px-4 py-2.5 font-medium">Tên đăng nhập</th>
                <th className="px-4 py-2.5 font-medium">Hoạt động gần nhất</th>
                <th className="px-4 py-2.5 font-medium">Ngày tham gia</th>
                <th className="px-4 py-2.5 font-medium">Vai trò</th>
                <th className="px-4 py-2.5 font-medium">Trạng thái</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const locked = u.role === "OWNER" && u.id !== me.id;
                return (
                  <tr key={u.id} className="border-b border-line last:border-0 hover:bg-panel-2">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.name} color={u.color} size={28} />
                        <span className="font-medium">{u.name}</span>
                        {u.id === me.id && <span className="text-xs text-dim">(bạn)</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-mut">{u.email}</td>
                    <td className="px-4 py-2.5 text-mut">{u.lastActiveAt ? timeAgo(u.lastActiveAt) : "Chưa đăng nhập"}</td>
                    <td className="px-4 py-2.5 text-mut">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-2.5">{ROLE_LABEL[u.role]}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", u.status === "ACTIVE" ? "bg-ok/15 text-ok" : "bg-err/15 text-err")}>
                        {u.status === "ACTIVE" ? "Hoạt động" : "Đã khoá"}
                      </span>
                    </td>
                    <td className="px-2">
                      {!locked && (
                        <Menu
                          trigger={() => (
                            <button className="btn-icon">
                              <MoreHorizontal size={16} />
                            </button>
                          )}
                        >
                          {(close) => (
                            <>
                              <MenuItem icon={<Pencil size={15} />} onClick={() => (close(), setModal({ mode: "edit", u }))}>
                                Sửa tên / vai trò
                              </MenuItem>
                              <MenuItem icon={<KeyRound size={15} />} onClick={() => (close(), setModal({ mode: "password", u }))}>
                                Đặt lại mật khẩu
                              </MenuItem>
                              {u.role !== "OWNER" &&
                                (u.status === "ACTIVE" ? (
                                  <MenuItem danger icon={<Ban size={15} />} onClick={() => (close(), patch(u, { status: "DISABLED" }, "Đã khoá tài khoản"))}>
                                    Khoá tài khoản
                                  </MenuItem>
                                ) : (
                                  <MenuItem icon={<CheckCircle2 size={15} />} onClick={() => (close(), patch(u, { status: "ACTIVE" }, "Đã mở khoá"))}>
                                    Mở khoá
                                  </MenuItem>
                                ))}
                            </>
                          )}
                        </Menu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-dim">
          Thành viên thấy các project được thêm vào. Khách hàng chỉ thấy project được mời và không thấy comment nội bộ.
        </p>
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === "new" ? "Thêm người dùng" : modal?.mode === "password" ? "Đặt lại mật khẩu" : "Sửa người dùng"}
      >
        {modal && (
          <UserForm
            key={modal.mode + ("u" in modal ? modal.u.id : "")}
            state={modal}
            meIsOwner={me.role === "OWNER"}
            onDone={(msg) => {
              setModal(null);
              toast(msg);
              router.refresh();
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function UserForm({
  state,
  meIsOwner,
  onDone,
  onCancel,
}: {
  state: { mode: "new" } | { mode: "edit"; u: U } | { mode: "password"; u: U };
  meIsOwner: boolean;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const u = "u" in state ? state.u : null;
  const [name, setName] = useState(u?.name ?? "");
  const [email, setEmail] = useState(u?.email ?? "");
  const [role, setRole] = useState<Role>(u?.role ?? "MEMBER");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const roles: Role[] = meIsOwner ? ["ADMIN", "MEMBER", "CLIENT"] : ["MEMBER", "CLIENT"];

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          if (state.mode === "new") {
            await api("/api/users", { body: { name, email, password, role } });
            onDone("Đã tạo tài khoản. Hãy gửi tên đăng nhập và mật khẩu cho người dùng.");
          } else if (state.mode === "edit") {
            await api(`/api/users/${u!.id}`, { method: "PATCH", body: { name, ...(u!.role !== "OWNER" ? { role } : {}) } });
            onDone("Đã lưu");
          } else {
            await api(`/api/users/${u!.id}`, { method: "PATCH", body: { password } });
            onDone("Đã đặt lại mật khẩu");
          }
        } catch (e) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }}
    >
      {state.mode !== "password" && (
        <>
          <label className="label">Họ tên</label>
          <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </>
      )}
      {state.mode === "new" && (
        <>
          <label className="label">Tên đăng nhập</label>
          <input
            className="input mb-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoCapitalize="none"
            spellCheck={false}
            placeholder="VD: lan.nguyen"
          />
          <p className="mb-3 text-xs text-dim">Chữ thường không dấu, số, dấu chấm, gạch ngang. Có thể dùng email nếu muốn.</p>
        </>
      )}
      {state.mode !== "password" && u?.role !== "OWNER" && (
        <>
          <label className="label">Vai trò</label>
          <select className="input mb-3" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={u?.role === "ADMIN" && !meIsOwner}>
            {(u?.role === "ADMIN" && !meIsOwner ? ["ADMIN" as Role] : roles).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </>
      )}
      {state.mode !== "edit" && (
        <>
          <label className="label">{state.mode === "new" ? "Mật khẩu ban đầu" : "Mật khẩu mới"} (ít nhất 8 ký tự)</label>
          <PasswordInput
            className="mb-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus={state.mode === "password"}
          />
          <p className="mb-3 text-xs text-dim">Người dùng có thể tự đổi mật khẩu trong mục Tài khoản của tôi.</p>
        </>
      )}
      {err && <p className="mb-3 text-sm text-err">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Huỷ
        </button>
        <button className="btn-primary" disabled={busy}>
          {state.mode === "new" ? "Tạo tài khoản" : "Lưu"}
        </button>
      </div>
    </form>
  );
}
