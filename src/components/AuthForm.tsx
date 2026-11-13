"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, PasswordInput, api } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "setup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api(mode === "login" ? "/api/auth/login" : "/api/setup", {
        body: mode === "login" ? { email, password } : { name, email, password },
      });
      router.replace("/");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={36} />
          <div>
            <div className="text-lg font-semibold leading-tight">Smee Review</div>
            <div className="text-xs text-mut">{mode === "login" ? "Đăng nhập để tiếp tục" : "Cài đặt lần đầu: tạo tài khoản chủ sở hữu"}</div>
          </div>
        </div>
        {mode === "setup" && (
          <div className="mb-3">
            <label className="label">Họ tên</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
        )}
        <div className="mb-3">
          <label className="label">Tên đăng nhập</label>
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus={mode === "login"}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={mode === "setup" ? "VD: admin" : undefined}
          />
        </div>
        <div className="mb-4">
          <label className="label">Mật khẩu{mode === "setup" && " (ít nhất 8 ký tự)"}</label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "setup" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>
        {err && <p className="mb-3 rounded-lg bg-err/10 px-3 py-2 text-sm text-[#ff9aac]">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản và bắt đầu"}
        </button>
        {mode === "login" && (
          <p className="mt-4 text-center text-xs text-dim">Chưa có tài khoản? Liên hệ quản trị viên để được cấp.</p>
        )}
      </form>
    </div>
  );
}
