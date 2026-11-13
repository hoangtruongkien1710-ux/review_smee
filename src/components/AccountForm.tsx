"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, PasswordInput, api, useToast } from "./ui";
import { COLORS, cn } from "@/lib/utils";

export function AccountForm({ me }: { me: { name: string; email: string; color: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(me.name);
  const [color, setColor] = useState(me.color);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-6 py-6">
        <h1 className="mb-6 text-xl font-semibold">Tài khoản của tôi</h1>
        <form
          className="card mb-6 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/api/account", { method: "PATCH", body: { name, color } });
              toast("Đã lưu");
              router.refresh();
            } catch (e) {
              toast((e as Error).message, "err");
            }
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={name || "?"} color={color} size={44} />
            <div className="text-sm text-mut">{me.email}</div>
          </div>
          <label className="label">Họ tên</label>
          <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="label">Màu avatar</label>
          <div className="mb-4 flex gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={cn("size-7 rounded-full ring-offset-2 ring-offset-panel", color === c && "ring-2 ring-fg")}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
          <button className="btn-primary">Lưu thông tin</button>
        </form>

        <form
          className="card p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/api/account", { method: "PATCH", body: { currentPassword: cur, newPassword: pw } });
              setCur("");
              setPw("");
              toast("Đã đổi mật khẩu");
            } catch (e) {
              toast((e as Error).message, "err");
            }
          }}
        >
          <h2 className="mb-3 font-medium">Đổi mật khẩu</h2>
          <label className="label">Mật khẩu hiện tại</label>
          <PasswordInput className="mb-3" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" />
          <label className="label">Mật khẩu mới (ít nhất 8 ký tự)</label>
          <PasswordInput className="mb-4" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} autoComplete="new-password" />
          <button className="btn-primary">Đổi mật khẩu</button>
        </form>
      </div>
    </div>
  );
}

