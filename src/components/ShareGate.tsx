"use client";

// Màn hình khi link cần mật khẩu / hết hạn / không tồn tại.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Clock, Link2Off } from "lucide-react";
import { Logo, PasswordInput, api } from "./ui";
import { LangPicker, useT } from "./I18n";

export function ShareGate({ token, reason, name }: { token: string; reason: "locked" | "expired" | "missing"; name?: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const t = useT();
  return (
    <div className="relative flex h-full items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <LangPicker />
      </div>
      <div className="card w-full max-w-sm p-7 text-center">
        <div className="mb-5 flex justify-center">
          <Logo size={36} />
        </div>
        {reason === "locked" ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr("");
              try {
                await api(`/api/share/${token}/unlock`, { body: { password: pw } });
                router.refresh();
              } catch (e) {
                setErr(t((e as Error).message));
                setBusy(false);
              }
            }}
          >
            <Lock className="mx-auto mb-2 text-accent" />
            <h1 className="mb-1 font-semibold">{name ?? t("Link chia sẻ")}</h1>
            <p className="mb-4 text-sm text-mut">{t("Link này cần mật khẩu để xem.")}</p>
            <PasswordInput className="mb-3" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus placeholder={t("Mật khẩu")} />
            {err && <p className="mb-3 text-sm text-err">{err}</p>}
            <button className="btn-primary w-full" disabled={busy || !pw}>
              {t("Xem")}
            </button>
          </form>
        ) : reason === "expired" ? (
          <>
            <Clock className="mx-auto mb-2 text-warn" />
            <h1 className="mb-1 font-semibold">{t("Link đã hết hạn")}</h1>
            <p className="text-sm text-mut">{t("Anh/chị liên hệ người gửi để xin link mới.")}</p>
          </>
        ) : (
          <>
            <Link2Off className="mx-auto mb-2 text-dim" />
            <h1 className="mb-1 font-semibold">{t("Link không còn hiệu lực")}</h1>
            <p className="text-sm text-mut">{t("Link không tồn tại hoặc đã bị tắt. Anh/chị liên hệ người gửi.")}</p>
          </>
        )}
      </div>
    </div>
  );
}
