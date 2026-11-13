"use client";

// Quản lý upload: chia file thành khúc 8 MB, upload tuần tự, rớt mạng thì tự thử lại và upload tiếp
// từ chỗ dừng. Nếu tải lại trang, chỉ cần thả lại đúng file đó vào đúng chỗ là upload tiếp.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Pause, Play, RotateCw, X, AlertCircle, UploadCloud } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";

type Status = "queued" | "uploading" | "paused" | "done" | "error";
export type UploadItem = {
  key: string;
  file: File;
  projectId: string;
  folderId: string | null;
  assetId: string | null;
  label: string; // tên project / thư mục để hiển thị
  status: Status;
  sent: number;
  speed: number;
  error?: string;
  uploadId?: string;
  resultAssetId?: string;
};

type Ctx = {
  items: UploadItem[];
  add: (files: File[], target: { projectId: string; folderId: string | null; assetId?: string | null; label: string }) => void;
  onFinished: (cb: (it: UploadItem) => void) => () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
};

const UploadCtx = createContext<Ctx | null>(null);
export function useUploads() {
  const c = useContext(UploadCtx);
  if (!c) throw new Error("UploadProvider missing");
  return c;
}
/** Như useUploads nhưng trả null khi không có UploadProvider (trang của khách). */
export function useUploadsOptional() {
  return useContext(UploadCtx);
}

const MAX_PARALLEL = 2;
const sigOf = (f: File, t: { projectId: string; folderId: string | null; assetId: string | null }) =>
  `sr.up:${t.projectId}:${t.folderId ?? ""}:${t.assetId ?? ""}:${f.name}:${f.size}:${f.lastModified}`;

function storeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function storeSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [open, setOpen] = useState(false);
  const itemsRef = useRef<UploadItem[]>([]);
  const ctrl = useRef(new Map<string, XMLHttpRequest>());
  const listeners = useRef(new Set<(it: UploadItem) => void>());
  itemsRef.current = items;

  const patch = useCallback((key: string, p: Partial<UploadItem>) => {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }, []);

  const add: Ctx["add"] = useCallback((files, t) => {
    const now = Date.now();
    const next = files.map((file, i) => ({
      key: `${now}-${i}-${file.name}`,
      file,
      projectId: t.projectId,
      folderId: t.folderId,
      assetId: t.assetId ?? null,
      label: t.label,
      status: "queued" as Status,
      sent: 0,
      speed: 0,
    }));
    setItems((xs) => [...xs, ...next]);
    setOpen(true);
  }, []);

  const onFinished = useCallback((cb: (it: UploadItem) => void) => {
    listeners.current.add(cb);
    return () => {
      listeners.current.delete(cb);
    };
  }, []);

  // Gửi một khúc bằng XHR để có tiến độ theo byte
  const sendChunk = (key: string, uploadId: string, offset: number, blob: Blob, onProg: (n: number) => void) =>
    new Promise<{ receivedBytes: number; completed: boolean; assetId?: string; status: number; error?: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      ctrl.current.set(key, xhr);
      xhr.open("PUT", `/api/uploads/${uploadId}?offset=${offset}`);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = (e) => onProg(e.loaded);
      xhr.onload = () => {
        ctrl.current.delete(key);
        let j: Record<string, unknown> = {};
        try {
          j = JSON.parse(xhr.responseText);
        } catch {}
        resolve({ ...(j as object), status: xhr.status } as never);
      };
      xhr.onerror = () => {
        ctrl.current.delete(key);
        reject(new Error("network"));
      };
      xhr.onabort = () => {
        ctrl.current.delete(key);
        reject(new Error("abort"));
      };
      xhr.send(blob);
    });

  const run = useCallback(
    async (it: UploadItem) => {
      const { key, file } = it;
      patch(key, { status: "uploading", error: undefined });
      const sig = sigOf(file, it);
      try {
        // 1. Lấy (hoặc tạo) phiên upload
        let uploadId = it.uploadId ?? storeGet(sig) ?? undefined;
        let offset = 0;
        let chunkSize = 8 * 1024 * 1024;
        if (uploadId) {
          const r = await fetch(`/api/uploads/${uploadId}`);
          if (r.ok) {
            const j = await r.json();
            if (j.completed) {
              storeSet(sig, null);
              patch(key, { status: "done", sent: file.size, resultAssetId: j.assetId });
              listeners.current.forEach((cb) => cb({ ...it, status: "done", resultAssetId: j.assetId }));
              return;
            }
            offset = j.receivedBytes;
          } else uploadId = undefined;
        }
        if (!uploadId) {
          const r = await fetch("/api/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: it.projectId,
              folderId: it.folderId,
              assetId: it.assetId,
              fileName: file.name,
              mimeType: file.type,
              size: file.size,
            }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? "Không bắt đầu upload được");
          uploadId = j.id as string;
          chunkSize = j.chunkSize;
          storeSet(sig, uploadId);
        }
        patch(key, { uploadId, sent: offset });

        // 2. Gửi từng khúc, lỗi mạng thì chờ rồi thử lại (tối đa ~10 phút)
        let retries = 0;
        let t0 = performance.now();
        let bytes0 = offset;
        for (;;) {
          const cur = itemsRef.current.find((x) => x.key === key);
          if (!cur || cur.status === "paused") return;
          const end = Math.min(offset + chunkSize, file.size);
          let res;
          try {
            res = await sendChunk(key, uploadId, offset, file.slice(offset, end), (n) => {
              const dt = (performance.now() - t0) / 1000;
              patch(key, { sent: offset + n, speed: dt > 0.5 ? (offset + n - bytes0) / dt : 0 });
            });
          } catch (e) {
            if ((e as Error).message === "abort") return;
            if (++retries > 40) throw new Error("Mất kết nối quá lâu");
            patch(key, { error: `Mất kết nối, thử lại sau ${Math.min(15, retries * 2)} giây…` });
            await new Promise((r) => setTimeout(r, Math.min(15, retries * 2) * 1000));
            const r = await fetch(`/api/uploads/${uploadId}`).catch(() => null);
            if (r?.ok) offset = (await r.json()).receivedBytes;
            t0 = performance.now();
            bytes0 = offset;
            continue;
          }
          if (res.status === 409) {
            offset = res.receivedBytes;
            continue;
          }
          if (res.status >= 400) throw new Error(res.error ?? `Lỗi ${res.status}`);
          retries = 0;
          offset = res.receivedBytes;
          patch(key, { sent: offset, error: undefined });
          if (res.completed) {
            storeSet(sig, null);
            patch(key, { status: "done", sent: file.size, resultAssetId: res.assetId });
            listeners.current.forEach((cb) => cb({ ...it, status: "done", resultAssetId: res.assetId }));
            return;
          }
        }
      } catch (e) {
        patch(key, { status: "error", error: (e as Error).message });
      }
    },
    [patch],
  );

  // Bộ điều phối: luôn chạy tối đa MAX_PARALLEL upload
  useEffect(() => {
    const active = items.filter((x) => x.status === "uploading").length;
    const next = items.filter((x) => x.status === "queued").slice(0, Math.max(0, MAX_PARALLEL - active));
    next.forEach((it) => void run(it));
  }, [items, run]);

  // Cảnh báo khi đóng tab lúc đang upload
  const busy = items.some((x) => x.status === "uploading" || x.status === "queued");
  const hasError = items.some((x) => x.status === "error");
  // Upload xong hết (không lỗi) thì tự thu gọn bảng sau 4 giây
  useEffect(() => {
    if (busy || hasError || !open || items.length === 0) return;
    const t = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(t);
  }, [busy, hasError, open, items.length]);
  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);

  const pause = (key: string) => {
    patch(key, { status: "paused" });
    ctrl.current.get(key)?.abort();
  };
  const resume = (key: string) => patch(key, { status: "queued", error: undefined });
  const cancel = async (key: string) => {
    const it = itemsRef.current.find((x) => x.key === key);
    ctrl.current.get(key)?.abort();
    setItems((xs) => xs.filter((x) => x.key !== key));
    if (it?.uploadId && it.status !== "done") {
      storeSet(sigOf(it.file, it), null);
      await fetch(`/api/uploads/${it.uploadId}`, { method: "DELETE" }).catch(() => {});
    }
  };
  const clearDone = () => setItems((xs) => xs.filter((x) => x.status !== "done"));

  const total = items.reduce((s, x) => s + x.file.size, 0);
  const sent = items.reduce((s, x) => s + x.sent, 0);
  const doneCount = items.filter((x) => x.status === "done").length;

  return (
    <UploadCtx.Provider value={{ items, add, onFinished, open, setOpen }}>
      {children}
      {items.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-96 overflow-hidden rounded-xl border border-line-2 bg-panel shadow-2xl">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <UploadCloud size={16} className="text-accent" />
            <div className="flex-1 text-sm font-medium">
              {busy ? `Đang upload ${doneCount}/${items.length} file` : `Đã upload ${doneCount}/${items.length} file`}
              {busy && <span className="ml-1 text-xs text-mut">({Math.floor((sent / Math.max(1, total)) * 100)}%)</span>}
            </div>
            {!busy && (
              <button className="text-xs text-mut hover:text-fg" onClick={clearDone}>
                Xoá danh sách
              </button>
            )}
            <button className="btn-icon size-7" onClick={() => setOpen(!open)} aria-label="Thu gọn">
              {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>
          {open && (
            <div className="max-h-80 overflow-y-auto">
              {items.map((it) => {
                const pct = it.file.size ? (it.sent / it.file.size) * 100 : 100;
                return (
                  <div key={it.key} className="border-b border-line px-4 py-2.5 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm" title={it.file.name}>
                          {it.assetId ? "Phiên bản mới: " : ""}
                          {it.file.name}
                        </div>
                        <div className="truncate text-xs text-mut">
                          {it.status === "done"
                            ? `Xong · ${formatBytes(it.file.size)} · ${it.label}`
                            : it.status === "error"
                              ? <span className="text-err">{it.error}</span>
                              : it.status === "paused"
                                ? `Tạm dừng · ${formatBytes(it.sent)} / ${formatBytes(it.file.size)}`
                                : it.status === "queued"
                                  ? `Chờ · ${formatBytes(it.file.size)}`
                                  : it.error
                                    ? <span className="text-warn">{it.error}</span>
                                    : `${formatBytes(it.sent)} / ${formatBytes(it.file.size)}${it.speed ? ` · ${formatBytes(it.speed)}/s` : ""}`}
                        </div>
                      </div>
                      {it.status === "done" && <CheckCircle2 size={17} className="text-ok" />}
                      {it.status === "error" && <AlertCircle size={17} className="text-err" />}
                      {it.status === "uploading" && (
                        <button className="btn-icon size-7" title="Tạm dừng" onClick={() => pause(it.key)}>
                          <Pause size={14} />
                        </button>
                      )}
                      {it.status === "paused" && (
                        <button className="btn-icon size-7" title="Tiếp tục" onClick={() => resume(it.key)}>
                          <Play size={14} />
                        </button>
                      )}
                      {it.status === "error" && (
                        <button className="btn-icon size-7" title="Thử lại" onClick={() => resume(it.key)}>
                          <RotateCw size={14} />
                        </button>
                      )}
                      {it.status !== "done" && (
                        <button className="btn-icon size-7" title="Huỷ" onClick={() => cancel(it.key)}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {it.status !== "done" && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                        <div
                          className={cn("h-full rounded-full transition-[width]", it.status === "error" ? "bg-err" : "bg-accent")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </UploadCtx.Provider>
  );
}
