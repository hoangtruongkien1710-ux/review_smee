"use client";

// Nút Duyệt / Cần sửa cho một phiên bản, kèm lịch sử ai đã duyệt.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ThumbsUp } from "lucide-react";
import type { ApprovalDTO } from "@/lib/approval-dto";
import { cn } from "@/lib/utils";
import { useI18n } from "../I18n";
import { Menu, api, useToast } from "../ui";

export function ApprovalButton({
  versionNo,
  url,
  needName,
  onDone,
}: {
  versionNo: number;
  url: string;
  needName: () => Promise<string | null>;
  onDone?: () => void;
}) {
  const toast = useToast();
  const { t, ago } = useI18n();
  const [list, setList] = useState<ApprovalDTO[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ approvals: ApprovalDTO[] }>(url);
      setList(r.approvals);
    } catch {
      setList([]);
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);

  const latest = list?.[0] ?? null;

  const decide = async (decision: "APPROVED" | "CHANGES", close: () => void) => {
    const name = await needName();
    if (!name) return;
    setBusy(true);
    try {
      await api(url, { body: { decision, note: note.trim() || undefined, guestName: name } });
      setNote("");
      close();
      toast(decision === "APPROVED" ? t("Đã duyệt V{n}", { n: versionNo }) : t("Đã gửi yêu cầu sửa V{n}", { n: versionNo }));
      await load();
      onDone?.();
    } catch (e) {
      toast(t((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Menu
      trigger={() => (
        <span
          className={cn(
            "btn h-8 cursor-pointer gap-1.5 border px-2.5",
            latest?.decision === "APPROVED"
              ? "border-ok/40 bg-ok/10 text-ok"
              : latest?.decision === "CHANGES"
                ? "border-err/40 bg-err/10 text-err"
                : "border-line-2 text-fg hover:bg-panel-2",
          )}
          title={t("Duyệt phiên bản")}
        >
          {latest?.decision === "APPROVED" ? (
            <CheckCircle2 size={15} />
          ) : latest?.decision === "CHANGES" ? (
            <XCircle size={15} />
          ) : (
            <ThumbsUp size={15} />
          )}
          <span className="max-w-40 truncate">
            {latest?.decision === "APPROVED" ? t("Đã duyệt") : latest?.decision === "CHANGES" ? t("Cần sửa") : t("Duyệt")}
          </span>
          <ChevronDown size={14} className="opacity-60" />
        </span>
      )}
    >
      {(close) => (
        <div className="w-80 p-2">
          <p className="mb-2 text-sm font-medium">{t("Duyệt phiên bản V{n}", { n: versionNo })}</p>
          <textarea
            className="input mb-2 min-h-16 resize-none py-2 text-sm"
            placeholder={t("Ghi chú (không bắt buộc)")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            maxLength={2000}
          />
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button className="btn h-9 bg-ok text-white hover:bg-ok/90" disabled={busy} onClick={() => decide("APPROVED", close)}>
              <CheckCircle2 size={15} /> {t("Duyệt")}
            </button>
            <button className="btn h-9 bg-err text-white hover:bg-err/90" disabled={busy} onClick={() => decide("CHANGES", close)}>
              <XCircle size={15} /> {t("Cần sửa")}
            </button>
          </div>
          <p className="mb-1 text-xs font-medium text-dim">{t("Lịch sử")}</p>
          {!list ? (
            <p className="py-2 text-xs text-mut">{t("Đang tải…")}</p>
          ) : list.length === 0 ? (
            <p className="py-2 text-xs text-mut">{t("Chưa ai duyệt phiên bản này.")}</p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {list.map((a) => (
                <li key={a.id} className="flex gap-2 text-sm">
                  {a.decision === "APPROVED" ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" />
                  ) : (
                    <XCircle size={15} className="mt-0.5 shrink-0 text-err" />
                  )}
                  <div className="min-w-0">
                    <div>
                      <b>{a.name}</b>
                      {a.guest && <span className="text-xs text-dim"> ({t("khách")})</span>}{" "}
                      <span className="text-mut">{a.decision === "APPROVED" ? t("đã duyệt") : t("yêu cầu sửa")}</span>
                      <span className="text-xs text-dim"> · {ago(a.createdAt)}</span>
                    </div>
                    {a.note && <p className="whitespace-pre-wrap break-words text-xs text-mut">{a.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Menu>
  );
}
