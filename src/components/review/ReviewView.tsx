"use client";

// Trang duyệt file: trình phát (video/audio/ảnh/PDF), vẽ lên khung hình, comment theo timeline.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  AlertTriangle,
  Info,
  Pencil,
  MoveUpRight,
  Square,
  CircleIcon,
  Undo2,
  Trash2,
  Check,
  Keyboard,
  Layers,
  ChevronDown,
  Columns2,
  UploadCloud,
  Star,
  FileDown,
  Share2,
  RefreshCw,
  HardDrive,
} from "lucide-react";
import type { AssetDTO, VersionDTO } from "@/lib/asset-dto";
import type { CommentDTO, Person, Shape } from "@/lib/comment-dto";
import { cn, formatBytes } from "@/lib/utils";
import { LangPicker, useI18n } from "../I18n";
import { localeOf } from "@/lib/i18n";
import { DEFAULT_FPS, frameOf, shortTime, type TcMode } from "@/lib/timecode";
import { api, useToast, useConfirm, Menu, MenuItem, Modal } from "../ui";
import { useUploadsOptional } from "../UploadManager";
import { ApprovalButton } from "./ApprovalButton";
import { ShareModal } from "../ShareModal";
import { StatusPill } from "../StatusPill";
import { KindIcon, formatDuration } from "../AssetThumb";
import { FitBox, Overlay, DRAW_COLORS, type Tool, type Pin } from "./Stage";
import { useMedia, useTransport, Timeline, Transport, type Marker } from "./Player";
import { CommentPanel, type Anchor } from "./Comments";
import { SheetView } from "./SheetView";

type Me = { id: string; name: string; color: string; role: string };
export type GuestCtx = { token: string; shareName: string; allowDownload: boolean; allowComment: boolean; allowApprove: boolean };

const GUEST_KEY = "sr_guest_name";
/** Tên khách (nhớ trong trình duyệt) */
function useGuestName() {
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      setName(localStorage.getItem(GUEST_KEY) ?? "");
    } catch {}
  }, []);
  const save = (n: string) => {
    setName(n);
    try {
      localStorage.setItem(GUEST_KEY, n);
    } catch {}
  };
  return [name, save] as const;
}

function useLocal<T extends string>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) setV(s as T);
    } catch {}
  }, [key]);
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {}
  };
  return [v, set] as const;
}

/** Nhãn chất lượng theo cạnh ngắn của khung hình: 4K, 1440p, 1080p, 720p... */
const qualityLabel = (w: number, h: number) => {
  const s = Math.min(w, h);
  return s >= 2160 ? "4K" : s >= 1440 ? "2K" : `${s}p`;
};

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

export type DriveLinks = { folder: string | null; files: Record<string, string> };

export function ReviewView({
  project,
  folder,
  asset,
  versions,
  siblingIds,
  me,
  canEdit,
  canComment,
  canManage,
  initialVersionId,
  initialCommentId,
  guest = null,
  drive = null,
}: {
  project: { id: string; name: string };
  folder: { id: string; name: string } | null;
  asset: AssetDTO;
  versions: VersionDTO[];
  siblingIds: string[];
  me: Me;
  canEdit: boolean;
  canComment: boolean;
  canManage: boolean;
  initialVersionId?: string | null;
  initialCommentId?: string | null;
  /** Khách xem qua link chia sẻ */
  guest?: GuestCtx | null;
  /** Link Google Drive (chỉ quản trị viên): thư mục chứa file và từng phiên bản */
  drive?: DriveLinks | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t, ago, lang } = useI18n();
  const { confirm, node: confirmNode } = useConfirm();
  // Bản mới đang xử lý thì mở bản cũ gần nhất đã xem được, xử lý xong tự chuyển sang bản mới
  const readyOf = (id?: string) => versions.find((x) => x.id === id)?.status === "READY";
  const [versionId, setVersionId] = useState(
    initialVersionId ??
      (readyOf(asset.version?.id) ? asset.version?.id : versions.find((x) => x.status === "READY")?.id) ??
      asset.version?.id ??
      versions[0]?.id,
  );
  useEffect(() => {
    if (initialVersionId) setVersionId(initialVersionId);
  }, [initialVersionId]);
  const v = versions.find((x) => x.id === versionId) ?? versions[0];
  const idx = siblingIds.indexOf(asset.id);
  const base = guest ? `/s/${guest.token}` : `/projects/${project.id}`;
  const go = (i: number) => router.push(`${base}/${guest ? "" : "assets/"}${siblingIds[i]}`);
  const canInternal = !guest && me.role !== "CLIENT";
  const fileBase = guest ? `/api/share/${guest.token}/files` : "/api/files";
  const commentsUrl = guest ? `/api/share/${guest.token}/assets/${asset.id}/comments` : `/api/assets/${asset.id}/comments`;
  const canDownload = !guest || guest.allowDownload;
  const [shareOpen, setShareOpen] = useState(false);

  // khách: hỏi tên trước khi comment / duyệt
  const [guestName, setGuestName] = useGuestName();
  const [nameAsk, setNameAsk] = useState<{ resolve: (n: string | null) => void } | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const needName = (): Promise<string | null> => {
    if (!guest) return Promise.resolve(me.name);
    if (guestName) return Promise.resolve(guestName);
    setNameDraft("");
    return new Promise((resolve) => setNameAsk({ resolve }));
  };

  /* ---------- phiên bản ---------- */
  const uploads = useUploadsOptional();
  const versionInput = useRef<HTMLInputElement>(null);
  // có phiên bản mới (vừa upload xong) → chuyển sang xem bản mới nhất
  const newest = versions[0]?.id;
  const prevNewest = useRef(newest);
  const newestReady = versions[0]?.status === "READY";
  const waitingFor = useRef<string | null>(null);
  useEffect(() => {
    if (newest && prevNewest.current && newest !== prevNewest.current) {
      if (newestReady) setVersionId(newest);
      else waitingFor.current = newest;
    }
    prevNewest.current = newest;
  }, [newest, newestReady]);
  useEffect(() => {
    if (newestReady && waitingFor.current === newest) {
      waitingFor.current = null;
      setVersionId(newest);
    }
  }, [newest, newestReady]);
  useEffect(() => uploads?.onFinished((it) => it.assetId === asset.id && router.refresh()), [uploads, asset.id, router]);
  const openCompare = () => {
    const other = versions.find((x) => x.id !== versionId) ?? versions[1];
    const [a, b] = [other, v].sort((p, q) => p!.versionNo - q!.versionNo);
    router.push(`/projects/${project.id}/assets/${asset.id}/compare?a=${a!.id}&b=${b!.id}`);
  };
  const makeCurrent = async (x: VersionDTO) => {
    try {
      await api(`/api/versions/${x.id}`, { method: "PATCH", body: { current: true } });
      toast(t("V{n} đã là bản hiện tại", { n: x.versionNo }));
      router.refresh();
    } catch (e) {
      toast(t((e as Error).message), "err");
    }
  };
  const removeVersion = async (x: VersionDTO) => {
    const ok = await confirm(
      t("Xoá V{n}?", { n: x.versionNo }),
      t("Bản xem của V{n} sẽ bị xoá, comment được chuyển sang phiên bản khác (gắn nhãn \"Từ V{n}\"). File gốc trên Google Drive được chuyển vào Thùng rác của Drive (khôi phục được trong 30 ngày).", { n: x.versionNo }),
    );
    if (!ok) return;
    try {
      await api(`/api/versions/${x.id}`, { method: "DELETE" });
      toast(t("Đã xoá V{n}", { n: x.versionNo }));
      setVersionId(versions.find((y) => y.id !== x.id)?.id ?? versions[0].id);
      router.refresh();
    } catch (e) {
      toast(t((e as Error).message), "err");
    }
  };

  // Đang xử lý → tải lại trang định kỳ
  const processingVersions = versions.filter((x) => x.status === "QUEUED" || x.status === "PROCESSING" || x.status === "UPLOADING");
  const busy = processingVersions.length > 0;
  const pendingNewer = v ? processingVersions.filter((x) => x.versionNo > v.versionNo) : [];
  useEffect(() => {
    // vào trang lúc bản mới đang xử lý → xong thì tự chuyển
    if (pendingNewer[0] && !waitingFor.current && !initialVersionId) waitingFor.current = pendingNewer[0].id;
  }, [pendingNewer, initialVersionId]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  // Bản xem đã bị dọn để tiết kiệm ổ đĩa → tự xếp hàng tạo lại khi có người mở
  const restoreAsked = useRef(new Set<string>());
  const restorePreview = useCallback(
    async (id: string) => {
      restoreAsked.current.add(id);
      try {
        await api(guest ? `/api/share/${guest.token}/versions/${id}/preview` : `/api/versions/${id}/preview`, { method: "POST" });
        router.refresh();
      } catch (e) {
        toast(t((e as Error).message), "err");
      }
    },
    [guest, router, toast],
  );
  useEffect(() => {
    if (v?.purged && v.status === "READY" && !v.error && !restoreAsked.current.has(v.id)) void restorePreview(v.id);
  }, [v?.id, v?.purged, v?.status, v?.error, restorePreview]);

  /* ---------- loại trình xem ---------- */
  const ready = v?.status === "READY";
  const view: "video" | "audio" | "image" | "pages" | "sheet" | "frame" | "none" = !ready
    ? "none"
    : v?.hasSheet
      ? "sheet"
      : !v?.hasProxy
        ? "none"
        : v.kind === "VIDEO"
      ? "video"
      : v.kind === "AUDIO"
        ? "audio"
        : v.kind === "IMAGE"
          ? "image"
          : v.hasPages
            ? "pages"
            : "frame";
  const timed = view === "video" || view === "audio";
  const fps = v?.fps && v.fps > 0 ? v.fps : DEFAULT_FPS;

  /* ---------- media ---------- */
  const [el, setEl] = useState<HTMLMediaElement | null>(null);
  const s = useMedia(el, v?.durationSec ?? null);
  const tr = useTransport(el, fps);
  const [tcMode, setTcMode] = useLocal<TcMode>("sr_tc_mode", "tc");
  const [inPt, setInPt] = useState<number | null>(null);
  const [outPt, setOutPt] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const [vidSize, setVidSize] = useState<{ w: number; h: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const h = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  }, []);

  // vòng lặp: đoạn In/Out nếu có, không thì cả file
  useEffect(() => {
    if (el) el.loop = loop && inPt == null && outPt == null;
  }, [el, loop, inPt, outPt]);
  useEffect(() => {
    if (!el || !s.playing || outPt == null) return;
    if (s.t >= outPt) {
      if (loop) tr.seek(inPt ?? 0);
      else {
        el.pause();
        tr.seek(outPt);
      }
    }
  }, [s.t, s.playing, el, loop, inPt, outPt, tr]);

  // waveform cho audio
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    setPeaks(null);
    if (!v?.hasWaveform) return;
    fetch(`${fileBase}/${v.id}/waveform`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => Array.isArray(j) && setPeaks(j))
      .catch(() => {});
  }, [v?.id, v?.hasWaveform]);

  /* ---------- trang PDF ---------- */
  const pageCount = Math.min(v?.pageCount ?? 1, 300);
  const [page, setPage] = useState(1); // trang PDF, hoặc sheet (bảng tính), đếm từ 1
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const sheetName = (n: number) => sheetNames[n - 1] ?? `Sheet ${n}`;
  const [pageAspect, setPageAspect] = useState<Record<number, number>>({});
  const [imgAspect, setImgAspect] = useState<number | null>(null);

  /* ---------- comment ---------- */
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const loadComments = useCallback(async () => {
    if (!v) return;
    try {
      const r = await api<{ comments: CommentDTO[] }>(`${commentsUrl}?versionId=${v.id}`);
      setComments(r.comments);
    } catch {}
  }, [commentsUrl, v]);
  useEffect(() => {
    setComments([]);
    void loadComments();
    const t = setInterval(() => document.visibilityState === "visible" && void loadComments(), 15000);
    return () => clearInterval(t);
  }, [loadComments]);
  useEffect(() => {
    if (guest) return;
    api<{ people: Person[] }>(`/api/projects/${project.id}/people`)
      .then((r) => setPeople(r.people.filter((p) => p.id !== me.id)))
      .catch(() => {});
  }, [project.id, me.id, guest]);

  // thứ tự hiển thị + số thứ tự comment
  const sorted = useMemo(() => {
    const key = (c: CommentDTO) =>
      timed ? (c.timeStart ?? Number.MAX_VALUE) : view === "pages" || view === "sheet" ? (c.page ?? Number.MAX_VALUE) : 0;
    return [...comments].sort((a, b) => key(a) - key(b) || a.createdAt.localeCompare(b.createdAt));
  }, [comments, timed, view]);
  const numbers = useMemo(() => new Map(sorted.map((c, i) => [c.id, i + 1])), [sorted]);
  const active = comments.find((c) => c.id === activeId) ?? null;

  /* ---------- nháp: vẽ, ghim ---------- */
  const [drawing, setDrawingRaw] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [placingPin, setPlacingPin] = useState(false);
  const [attach, setAttach] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const setDrawing = (d: boolean) => {
    if (d) {
      tr.pause();
      setPlacingPin(false);
      setActiveId(null);
    }
    setDrawingRaw(d);
  };
  const clearDraft = () => {
    setShapes([]);
    setPin(null);
    setDrawingRaw(false);
    setPlacingPin(false);
  };
  // đổi phiên bản → làm mới
  useEffect(() => {
    clearDraft();
    setActiveId(null);
    setInPt(null);
    setOutPt(null);
    setPage(1);
    setVidSize(null);
    setImgAspect(null);
  }, [versionId]);

  const selectComment = useCallback(
    (c: CommentDTO) => {
      setActiveId(c.id);
      setDrawingRaw(false);
      setPlacingPin(false);
      if (timed && c.timeStart != null) {
        tr.pause();
        tr.seek(c.timeStart);
      }
      if (c.page) setPage(c.page);
    },
    [timed, tr],
  );

  // mở từ link thông báo (?c=…)
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!initialCommentId || opened.current === initialCommentId || !comments.length) return;
    const c = comments.find((x) => x.id === initialCommentId || x.replies.some((r) => r.id === initialCommentId));
    if (!c) return;
    if (timed && !el) return; // đợi trình phát sẵn sàng
    opened.current = initialCommentId;
    selectComment(c);
  }, [initialCommentId, comments, selectComment, timed, el]);

  const anchorLabel = timed
    ? inPt != null && outPt != null
      ? `${shortTime(inPt, fps, s.duration, tcMode)} → ${shortTime(outPt, fps, s.duration, tcMode)}`
      : shortTime(inPt ?? s.t, fps, s.duration, tcMode)
    : view === "pages"
      ? t("Trang {n}", { n: page })
      : view === "sheet"
        ? sheetName(page)
        : null;

  const anchorOf = (c: CommentDTO): Anchor => {
    if (c.timeStart != null)
      return {
        icon: "time",
        label:
          shortTime(c.timeStart, fps, s.duration, tcMode) +
          (c.timeEnd != null ? ` → ${shortTime(c.timeEnd, fps, s.duration, tcMode)}` : ""),
      };
    if (c.page != null) return { icon: "page", label: view === "sheet" ? sheetName(c.page) : t("Trang {n}", { n: c.page }) };
    if (c.pinX != null) return { icon: "pin", label: t("Ghim") };
    return null;
  };

  const create = async (body: string, internal: boolean) => {
    if (!v) return false;
    const payload: Record<string, unknown> = { versionId: v.id, body, internal };
    if (timed && attach) {
      payload.timeStart = inPt ?? s.t;
      if (inPt != null && outPt != null) payload.timeEnd = outPt;
    }
    if ((view === "pages" || view === "sheet") && attach) payload.page = page;
    if (pin) Object.assign(payload, { pinX: pin.x, pinY: pin.y });
    if (shapes.length) payload.annotation = { shapes };
    if (guest) {
      const n = await needName();
      if (!n) return false;
      payload.guestName = n;
    }
    try {
      const r = await api<{ comment: CommentDTO }>(commentsUrl, { body: payload });
      setComments((x) => [...x, { ...r.comment, replies: [] }]);
      clearDraft();
      if (inPt != null && outPt != null) {
        setInPt(null);
        setOutPt(null);
      }
      router.refresh();
      return true;
    } catch (e) {
      toast(t((e as Error).message), "err");
      return false;
    }
  };
  const reply = async (parentId: string, body: string) => {
    const gn = guest ? await needName() : null;
    if (guest && !gn) throw new Error(t("Cần nhập tên"));
    try {
      const r = await api<{ comment: CommentDTO }>(commentsUrl, { body: { versionId: v!.id, parentId, body, ...(guest ? { guestName: gn } : {}) } });
      setComments((x) => x.map((c) => (c.id === parentId ? { ...c, replies: [...c.replies, r.comment] } : c)));
    } catch (e) {
      toast(t((e as Error).message), "err");
      throw e;
    }
  };
  const update = async (id: string, patch: { body?: string; resolved?: boolean }) => {
    try {
      const r = await api<{ comment: CommentDTO }>(`/api/comments/${id}`, { method: "PATCH", body: patch });
      setComments((x) =>
        x.map((c) =>
          c.id === id
            ? { ...r.comment, replies: c.replies }
            : { ...c, replies: c.replies.map((rp) => (rp.id === id ? r.comment : rp)) },
        ),
      );
    } catch (e) {
      toast(t((e as Error).message), "err");
    }
  };
  const remove = async (id: string, isReply: boolean) => {
    const ok = await confirm(t("Xoá comment?"), isReply ? t("Trả lời này sẽ bị xoá.") : t("Comment và các trả lời của nó sẽ bị xoá."));
    if (!ok) return;
    try {
      await api(`/api/comments/${id}`, { method: "DELETE" });
      setComments((x) => x.filter((c) => c.id !== id).map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== id) })));
      if (activeId === id) setActiveId(null);
      router.refresh();
    } catch (e) {
      toast(t((e as Error).message), "err");
    }
  };
  const copyLink = (c: CommentDTO) => {
    const url = guest ? `${location.origin}/s/${guest.token}/${asset.id}?c=${c.id}` : `${location.origin}/projects/${project.id}/assets/${asset.id}?c=${c.id}`;
    void navigator.clipboard?.writeText(url).then(
      () => toast(t("Đã sao chép link comment")),
      () => toast(url),
    );
  };

  /* ---------- phím tắt ---------- */
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "c" && canComment) {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (k === "?") return setHelpOpen((x) => !x);
      if (k === "escape") {
        if (drawing) setDrawingRaw(false);
        else if (placingPin) setPlacingPin(false);
        else setActiveId(null);
        return;
      }
      if (view === "pages") {
        if (k === "arrowleft" || k === "pageup") setPage((p) => Math.max(1, p - 1));
        if (k === "arrowright" || k === "pagedown") setPage((p) => Math.min(pageCount, p + 1));
        return;
      }
      if (!timed || !el) return;
      const handled = true;
      switch (k) {
        case " ":
          tr.toggle();
          break;
        case "k":
          tr.pause();
          break;
        case "j":
          tr.backward();
          break;
        case "l":
          tr.forward();
          break;
        case "arrowleft":
          tr.step(e.shiftKey ? -Math.round(fps) : -1);
          break;
        case "arrowright":
          tr.step(e.shiftKey ? Math.round(fps) : 1);
          break;
        case "home":
          tr.seek(0);
          break;
        case "end":
          tr.seek(s.duration);
          break;
        case "i":
          setInPt(el.currentTime);
          if (outPt != null && outPt <= el.currentTime) setOutPt(null);
          break;
        case "o":
          setOutPt(el.currentTime);
          if (inPt != null && inPt >= el.currentTime) setInPt(null);
          break;
        case "x":
          setInPt(null);
          setOutPt(null);
          break;
        case "m":
          el.muted = !el.muted;
          break;
        case "f":
          if (view === "video") toggleFullscreen();
          break;
        default:
          return;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [timed, el, tr, fps, s.duration, inPt, outPt, view, pageCount, drawing, placingPin, canComment, toggleFullscreen]);

  /* ---------- hiển thị trên khung hình ---------- */
  const near = (c: CommentDTO) =>
    c.timeStart != null &&
    (c.timeEnd != null
      ? s.t >= c.timeStart - 0.5 / fps && s.t <= c.timeEnd + 0.5 / fps
      : Math.abs(frameOf(s.t, fps) - frameOf(c.timeStart, fps)) <= 1);
  const visibleShapes: Shape[] = [
    ...(active?.annotation && (!timed || near(active)) && (view !== "pages" || active.page === page) ? active.annotation.shapes : []),
    ...shapes,
  ];
  const pins: Pin[] = sorted
    .filter((c) => c.pinX != null && c.pinY != null && (view !== "pages" || c.page === page))
    .map((c) => ({ id: c.id, x: c.pinX!, y: c.pinY!, n: numbers.get(c.id)!, color: c.author?.color ?? "#9aa1ad", resolved: c.resolved }));
  const markers: Marker[] = sorted
    .filter((c) => c.timeStart != null)
    .map((c) => ({
      id: c.id,
      start: c.timeStart!,
      end: c.timeEnd,
      color: c.author?.color ?? "#9aa1ad",
      label: `#${numbers.get(c.id)} ${c.author?.name ?? ""}: ${c.body.slice(0, 80)}`,
      resolved: c.resolved,
      active: c.id === activeId,
    }));

  const overlay = (box: { w: number; h: number }) => (
    <Overlay
      w={box.w}
      h={box.h}
      shapes={visibleShapes}
      drawing={drawing}
      tool={tool}
      color={color}
      onAdd={(sh) => setShapes((x) => [...x, sh])}
      pins={view === "image" || view === "pages" ? pins : []}
      activePinId={activeId}
      onPinClick={(id) => {
        const c = comments.find((x) => x.id === id);
        if (c) selectComment(c);
      }}
      placingPin={placingPin}
      onPlacePin={(x, y) => {
        setPin({ x, y });
        setPlacingPin(false);
        inputRef.current?.focus();
      }}
      draftPin={pin}
    />
  );

  const drawBar = drawing && (
    <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-line-2 bg-panel-2/95 p-1 shadow-xl backdrop-blur">
      {(
        [
          ["pen", Pencil, "Bút"],
          ["arrow", MoveUpRight, "Mũi tên"],
          ["rect", Square, "Hình chữ nhật"],
          ["ellipse", CircleIcon, "Hình tròn"],
        ] as const
      ).map(([k, Icon, label]) => (
        <button key={k} title={t(label)} onClick={() => setTool(k)} className={cn("btn-icon", tool === k && "bg-accent/20 text-accent")}>
          <Icon size={16} />
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-line-2" />
      {DRAW_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => setColor(c)}
          className={cn("size-5 rounded-full border-2", color === c ? "border-white" : "border-transparent")}
          style={{ background: c }}
          aria-label={t("Màu {c}", { c })}
        />
      ))}
      <span className="mx-1 h-5 w-px bg-line-2" />
      <button className="btn-icon" title={t("Hoàn tác")} disabled={!shapes.length} onClick={() => setShapes((x) => x.slice(0, -1))}>
        <Undo2 size={16} />
      </button>
      <button className="btn-icon" title={t("Xoá hết nét vẽ")} disabled={!shapes.length} onClick={() => setShapes([])}>
        <Trash2 size={16} />
      </button>
      <button
        className="btn-primary ml-1 h-8 px-2.5 text-xs"
        onClick={() => {
          setDrawingRaw(false);
          inputRef.current?.focus();
        }}
      >
        <Check size={14} /> Xong
      </button>
    </div>
  );

  /* ---------- giao diện ---------- */
  const stage = () => {
    if (!v) return null;
    if (v.status === "FAILED")
      return (
        <div className="m-auto text-center text-sm text-mut">
          <AlertTriangle className="mx-auto mb-2 text-err" />
          {t("Xử lý file bị lỗi: {e}", { e: v.error ?? "" })}
        </div>
      );
    if (v.status !== "READY")
      return (
        <div className="m-auto text-center text-sm text-mut">
          <Loader2 className="mx-auto mb-2 animate-spin text-accent" />
          {v.purged ? (
            <>
              {t("Đang tạo lại bản xem từ file gốc trên Google Drive")}{v.status === "PROCESSING" ? ` ${v.progress}%` : ""}…
              <span className="mt-1 block text-xs">{t("File này lâu không ai mở nên bản xem đã được dọn để tiết kiệm ổ đĩa.")}</span>
            </>
          ) : v.status === "PROCESSING" ? (
            t("Đang xử lý {p}%…", { p: v.progress })
          ) : (
            t("Đang chờ xử lý…")
          )}
        </div>
      );
    if (v.purged)
      return (
        <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center text-sm text-mut">
          <KindIcon asset={asset} size={48} />
          <p>{t("File này lâu không ai mở nên bản xem đã được dọn để tiết kiệm ổ đĩa.")}</p>
          {v.error && <p className="text-xs text-err">{t("Lần tạo lại trước bị lỗi: {e}", { e: v.error })}</p>}
          <button className="btn-primary" onClick={() => restorePreview(v.id)}>
            <RefreshCw size={15} /> {t("Tạo lại bản xem")}
          </button>
        </div>
      );
    if (view === "none")
      return (
        <div className="m-auto flex flex-col items-center gap-3 text-center text-mut">
          <KindIcon asset={asset} size={48} />
          <p className="text-sm">{t("Loại file này chưa xem trực tiếp được. Bạn vẫn có thể comment chung bên phải.")}</p>
          {canDownload && (
            <a className="btn-primary" href={`${fileBase}/${v.id}/original`}>
              <Download size={15} /> {t("Tải về")} ({formatBytes(v.size)})
            </a>
          )}
        </div>
      );
    if (view === "video") {
      const aspect = vidSize ? vidSize.w / vidSize.h : v.width && v.height ? v.width / v.height : 16 / 9;
      return (
        <FitBox aspect={aspect} className="p-3">
          {(box) => (
            <>
              <video
                key={v.id}
                ref={setEl}
                src={`${fileBase}/${v.id}/proxy`}
                preload="auto"
                playsInline
                className="absolute inset-0 h-full w-full bg-black"
                onLoadedMetadata={(e) => {
                  const t = e.currentTarget;
                  if (t.videoWidth) setVidSize({ w: t.videoWidth, h: t.videoHeight });
                }}
                onClick={() => !drawing && !placingPin && tr.toggle()}
                onDoubleClick={toggleFullscreen}
              />
              {overlay(box)}
            </>
          )}
        </FitBox>
      );
    }
    if (view === "audio")
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          <audio key={v.id} ref={setEl} src={`${fileBase}/${v.id}/proxy`} preload="auto" />
          <KindIcon asset={asset} size={44} />
          <p className="max-w-full truncate text-sm text-mut">{v.originalName}</p>
          <div className="w-full max-w-4xl">
            <Timeline
              tall
              duration={s.duration}
              t={s.t}
              buffered={s.buffered}
              fps={fps}
              mode={tcMode}
              onSeek={tr.seek}
              markers={markers}
              onMarker={(id) => {
                const c = comments.find((x) => x.id === id);
                if (c) selectComment(c);
              }}
              inPt={inPt}
              outPt={outPt}
              waveform={peaks ?? []}
            />
          </div>
        </div>
      );
    if (view === "image")
      return (
        <FitBox aspect={imgAspect ?? (v.width && v.height ? v.width / v.height : 1)} className="p-4">
          {(box) => (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${fileBase}/${v.id}/proxy`}
                alt={asset.name}
                draggable={false}
                onLoad={(e) => setImgAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
                className="absolute inset-0 h-full w-full select-none object-contain"
              />
              {overlay(box)}
            </>
          )}
        </FitBox>
      );
    if (view === "sheet")
      return <SheetView key={v.id} url={`${fileBase}/${v.id}/sheet`} sheet={page} onSheet={setPage} onLoaded={setSheetNames} />;
    if (view === "pages")
      return (
        <FitBox aspect={pageAspect[page] ?? 1 / 1.414} className="p-4">
          {(box) => (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={page}
                src={`${fileBase}/${v.id}/page?n=${page}`}
                alt={`Trang ${page}`}
                draggable={false}
                onLoad={(e) => {
                  const a = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
                  setPageAspect((x) => (x[page] === a ? x : { ...x, [page]: a }));
                }}
                className="absolute inset-0 h-full w-full select-none bg-white object-contain shadow-2xl"
              />
              {overlay(box)}
            </>
          )}
        </FitBox>
      );
    return <iframe key={v.id} src={`${fileBase}/${v.id}/proxy`} className="m-3 flex-1 rounded bg-white" title={asset.name} />;
  };

  const sprite =
    view === "video" && v?.spriteCols && v.spriteCount
      ? { url: `${fileBase}/${v.id}/sprite`, cols: v.spriteCols, count: v.spriteCount, aspect: vidSize ? vidSize.w / vidSize.h : v.width && v.height ? v.width / v.height : 16 / 9 }
      : null;

  const infoList = v && (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-2 text-sm text-mut">
      <dt>{t("Phiên bản")}</dt>
      <dd className="text-fg">V{v.versionNo}</dd>
      <dt>{t("Tên gốc")}</dt>
      <dd className="max-w-56 break-all text-fg">{v.originalName}</dd>
      <dt>{t("Dung lượng")}</dt>
      <dd className="text-fg">{formatBytes(v.size)}</dd>
      {v.durationSec ? (
        <>
          <dt>{t("Thời lượng")}</dt>
          <dd className="text-fg">{formatDuration(v.durationSec)}</dd>
        </>
      ) : null}
      {v.fps ? (
        <>
          <dt>{t("Khung hình")}</dt>
          <dd className="text-fg">{v.fps} fps</dd>
        </>
      ) : null}
      {v.width ? (
        <>
          <dt>{t("Độ phân giải")}</dt>
          <dd className="text-fg">
            {v.width}×{v.height}
            {v.height ? ` (${qualityLabel(v.width, v.height)})` : ""}
          </dd>
          {v.kind === "VIDEO" && vidSize && (
            <>
              <dt>{t("Bản xem")}</dt>
              <dd className="text-fg">
                {vidSize.w}×{vidSize.h} ({qualityLabel(vidSize.w, vidSize.h)})
              </dd>
            </>
          )}
        </>
      ) : null}
      {v.pageCount ? (
        <>
          <dt>{t("Số trang")}</dt>
          <dd className="text-fg">{v.pageCount}</dd>
        </>
      ) : null}
      {!guest && (
        <>
          <dt>{t("Upload bởi")}</dt>
          <dd className="text-fg">{v.uploadedBy}</dd>
        </>
      )}
      <dt>{t("Lúc")}</dt>
      <dd className="text-fg">{new Date(v.createdAt).toLocaleString(localeOf(lang))}</dd>
      {!guest && (
        <>
          <dt>Google Drive</dt>
          <dd className={cn(v.onDrive ? "text-ok" : "text-mut")}>
            {drive?.files[v.id] ? (
              <a className="underline hover:text-fg" href={drive.files[v.id]} target="_blank" rel="noreferrer">
                {t("Đã lưu")} · {t("Mở file")}
              </a>
            ) : v.onDrive ? (
              t("Đã lưu")
            ) : (
              t("Chưa lưu")
            )}
          </dd>
          {drive?.folder && (
            <>
              <dt>{t("Thư mục Drive")}</dt>
              <dd>
                <a className="text-fg underline" href={drive.folder} target="_blank" rel="noreferrer">
                  {t("Mở thư mục")}
                </a>
              </dd>
            </>
          )}
        </>
      )}
    </dl>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-mut">
          <Link href={base} className="truncate hover:text-fg">
            {guest ? guest.shareName : project.name}
          </Link>
          {folder && (
            <>
              <ChevronRight size={14} className="shrink-0" />
              <Link href={guest ? `${base}?f=${folder.id}` : `/projects/${project.id}?folder=${folder.id}`} className="truncate hover:text-fg">
                {folder.name}
              </Link>
            </>
          )}
          <ChevronRight size={14} className="shrink-0" />
          <span className="truncate font-medium text-fg">{asset.name}</span>
        </nav>
        {siblingIds.length > 1 && (
          <div className="flex items-center gap-1 text-sm text-mut">
            <button className="btn-icon" disabled={idx <= 0} onClick={() => go(idx - 1)} aria-label={t("File trước")}>
              <ChevronLeft size={16} />
            </button>
            <span className="tabular-nums">
              {idx + 1} / {siblingIds.length}
            </span>
            <button className="btn-icon" disabled={idx >= siblingIds.length - 1} onClick={() => go(idx + 1)} aria-label="File sau">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        {v && guest && (
          <span className="rounded-md border border-line-2 px-2 py-1 text-xs font-semibold text-mut" title={t("Phiên bản")}>
            V{v.versionNo}
          </span>
        )}
        {v && !guest && (
          <Menu
            trigger={() => (
              <span className="btn-outline h-8 cursor-pointer gap-1.5 px-2.5" title={t("Phiên bản")}>
                <Layers size={15} /> V{v.versionNo}
                {versions.length > 1 && <span className="text-xs text-dim">/ {versions.length}</span>}
                <ChevronDown size={14} className="text-dim" />
              </span>
            )}
          >
            {(close) => (
              <div className="w-72">
                <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-dim">{t("Phiên bản")}</p>
                {versions.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => {
                      setVersionId(x.id);
                      close();
                    }}
                    className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-line", x.id === v.id && "bg-line/60")}
                  >
                    <span className={cn("w-7 font-semibold", x.id === v.id ? "text-accent" : "text-fg")}>V{x.versionNo}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-mut">
                      {x.uploadedBy ?? "?"} · {ago(x.createdAt)}
                    </span>
                    {x.id === asset.version?.id && <span className="rounded bg-ok/15 px-1.5 text-[10px] font-medium text-ok">{t("Hiện tại")}</span>}
                    {x.status !== "READY" && <span className="text-[10px] text-warn">{x.status === "FAILED" ? t("Lỗi") : t("Đang xử lý")}</span>}
                  </button>
                ))}
                <div className="my-1 h-px bg-line-2" />
                {versions.length > 1 && (
                  <MenuItem icon={<Columns2 size={14} />} onClick={() => (close(), openCompare())}>
                    So sánh 2 phiên bản
                  </MenuItem>
                )}
                {canEdit && (
                  <MenuItem icon={<UploadCloud size={14} />} onClick={() => (close(), versionInput.current?.click())}>
                    Tải lên phiên bản mới
                  </MenuItem>
                )}
                {canEdit && v.id !== asset.version?.id && (
                  <MenuItem icon={<Star size={14} />} onClick={() => (close(), void makeCurrent(v))}>
                    Đặt V{v.versionNo} làm bản hiện tại
                  </MenuItem>
                )}
                {canEdit && versions.length > 1 && (
                  <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (close(), void removeVersion(v))}>
                    Xoá V{v.versionNo}
                  </MenuItem>
                )}
              </div>
            )}
          </Menu>
        )}
        {v && v.status === "READY" && (guest ? guest.allowApprove : canComment) && (
          <ApprovalButton
            key={v.id}
            versionNo={v.versionNo}
            url={guest ? `/api/share/${guest.token}/versions/${v.id}/approvals` : `/api/versions/${v.id}/approvals`}
            needName={needName}
            onDone={() => router.refresh()}
          />
        )}
        {!guest && (
        <StatusPill
          value={asset.status}
          onChange={
            canEdit
              ? async (st) => {
                  try {
                    await api(`/api/assets/${asset.id}`, { method: "PATCH", body: { status: st } });
                    router.refresh();
                  } catch (e) {
                    toast(t((e as Error).message), "err");
                  }
                }
              : undefined
          }
        />
        )}
        {!guest && v && (
          <Menu trigger={() => <span className="btn-icon cursor-pointer" title={t("Xuất comment")}><FileDown size={17} /></span>}>
            {(close) => (
              <div className="w-64">
                <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-dim">Xuất comment V{v.versionNo}</p>
                {(
                  [
                    ["pdf", "PDF (in / lưu PDF, có hình)"],
                    ["xlsx", "Excel (.xlsx)"],
                    ...(timed
                      ? [
                          ["premiere", "Marker cho Premiere (.xml)"],
                          ["resolve", "Marker cho DaVinci Resolve (.edl)"],
                        ]
                      : []),
                  ] as const
                ).map(([f, label]) => (
                  <MenuItem
                    key={f}
                    onClick={() => {
                      close();
                      if (f === "pdf") window.open(`/print/${v.id}`, "_blank");
                      else window.location.href = `/api/versions/${v.id}/export?format=${f}`;
                    }}
                  >
                    {label}
                  </MenuItem>
                ))}
              </div>
            )}
          </Menu>
        )}
        {!guest && canEdit && (
          <button className="btn-icon" title={t("Chia sẻ cho khách")} onClick={() => setShareOpen(true)}>
            <Share2 size={17} />
          </button>
        )}
        <Menu trigger={() => <span className="btn-icon cursor-pointer" title={t("Thông tin file")}><Info size={17} /></span>}>
          {() => infoList}
        </Menu>
        {guest && <LangPicker className="hidden sm:inline-flex" />}
        <button className="btn-icon" title={t("Phím tắt (?)")} onClick={() => setHelpOpen(true)}>
          <Keyboard size={17} />
        </button>
        {v && !guest && drive?.files[v.id] && (
          <a className="btn-icon" title={t("Mở file gốc trên Google Drive")} href={drive.files[v.id]} target="_blank" rel="noreferrer">
            <HardDrive size={17} />
          </a>
        )}
        {v && canDownload && (
          <a className="btn-outline h-8" href={`${fileBase}/${v.id}/original`}>
            <Download size={15} /> {t("Tải gốc")}
          </a>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div ref={stageRef} className="relative flex min-w-0 flex-1 flex-col bg-[#08090b]">
          {drawBar}
          {pendingNewer.length > 0 && !drawing && !placingPin ? (
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg bg-panel-2/90 px-2.5 py-1 text-xs text-mut backdrop-blur">
              <Loader2 size={13} className="animate-spin text-accent" />
              <span>
                <b className="text-fg">V{pendingNewer[0].versionNo}</b> {t("đang xử lý")}{" "}
                {pendingNewer[0].status === "PROCESSING" ? `${pendingNewer[0].progress}%` : t("(đang chờ)")} · {t("bạn đang xem V{n}, xong sẽ tự chuyển", { n: v?.versionNo ?? "" })}
              </span>
            </div>
          ) : v && asset.version && v.id !== asset.version.id && !drawing && !placingPin && (
            <div className="absolute left-3 top-3 z-10 rounded-lg bg-panel-2/90 px-2.5 py-1 text-xs text-mut backdrop-blur">
              {t("Đang xem")} <b className="text-fg">V{v.versionNo}</b> {t("(bản cũ) · bản hiện tại là V{n}", { n: asset.version.versionNo })}
            </div>
          )}
          {placingPin && (
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              {t("Bấm vào vị trí cần ghim comment · Esc để huỷ")}
            </div>
          )}
          <div className="relative flex min-h-0 min-w-0 flex-1">{stage()}</div>

          {timed && ready && (
            <div className="shrink-0 border-t border-line bg-panel px-3 pb-2 pt-1">
              {view === "video" && (
                <Timeline
                  duration={s.duration}
                  t={s.t}
                  buffered={s.buffered}
                  fps={fps}
                  mode={tcMode}
                  onSeek={tr.seek}
                  onScrubStart={tr.pause}
                  markers={markers}
                  onMarker={(id) => {
                    const c = comments.find((x) => x.id === id);
                    if (c) selectComment(c);
                  }}
                  inPt={inPt}
                  outPt={outPt}
                  sprite={sprite}
                />
              )}
              <Transport
                el={el}
                s={s}
                fps={fps}
                mode={tcMode}
                setMode={setTcMode}
                tr={tr}
                loop={loop}
                setLoop={setLoop}
                inPt={inPt}
                outPt={outPt}
                setIn={() => {
                  setInPt(s.t);
                  if (outPt != null && outPt <= s.t) setOutPt(null);
                }}
                setOut={() => {
                  setOutPt(s.t);
                  if (inPt != null && inPt >= s.t) setInPt(null);
                }}
                clearInOut={() => {
                  setInPt(null);
                  setOutPt(null);
                }}
                fullscreen={fullscreen}
                onFullscreen={view === "video" ? toggleFullscreen : undefined}
                extra={
                  view === "video" && vidSize ? (
                    <span
                      className="mr-1 rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-mut"
                      title={`${t("Chất lượng xem")}: ${vidSize.w}×${vidSize.h}${v?.width && v.height ? ` · ${t("File gốc")}: ${v.width}×${v.height}` : ""}`}
                    >
                      {qualityLabel(vidSize.w, vidSize.h)}
                    </span>
                  ) : undefined
                }
              />
            </div>
          )}
          {view === "pages" && (
            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-line bg-panel px-3 py-2 text-sm">
              <button className="btn-icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t("Trang trước")}>
                <ChevronLeft size={16} />
              </button>
              <span className="text-mut">{t("Trang")}</span>
              <input
                className="input h-8 w-14 text-center tabular-nums"
                value={page}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isInteger(n) && n >= 1 && n <= pageCount) setPage(n);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <span className="text-mut">/ {pageCount}</span>
              <button className="btn-icon" disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label={t("Trang sau")}>
                <ChevronRight size={16} />
              </button>
              {v?.pageCount && v.pageCount > pageCount && (
                <span className="text-xs text-dim">{t("(hiển thị {n} trang đầu, tải gốc để xem hết)", { n: pageCount })}</span>
              )}
            </div>
          )}
        </div>

        <CommentPanel
          comments={sorted}
          numbers={numbers}
          anchorOf={anchorOf}
          me={me}
          people={people}
          canComment={(guest ? guest.allowComment : canComment) && !!v}
          canResolve={!guest && canComment && !!v}
          canManage={canManage}
          canInternal={canInternal}
          activeId={activeId}
          onSelect={selectComment}
          onCreate={create}
          onReply={reply}
          onUpdate={update}
          onDelete={remove}
          onCopyLink={copyLink}
          inputRef={inputRef}
          composer={{
            anchorLabel,
            anchorIcon: timed ? "time" : "page",
            attach,
            setAttach,
            canDraw: view === "video" || view === "image" || view === "pages",
            drawing,
            setDrawing,
            shapeCount: shapes.length,
            canPin: view === "image" || view === "pages",
            placingPin,
            setPlacingPin: (p) => {
              setPlacingPin(p);
              if (p) setDrawingRaw(false);
            },
            pinSet: !!pin,
            clearDraft,
            onFocus: () => {
              if (s.playing) tr.pause();
            },
          }}
        />
      </div>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t("Phím tắt")} width={420}>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {[
            ["Space", "Phát / dừng"],
            ["J / K / L", "Tua lùi / dừng / phát tới (bấm nhiều lần để nhanh hơn)"],
            ["← / →", "Lùi / tới 1 khung hình"],
            ["Shift + ← / →", "Lùi / tới 1 giây"],
            ["I / O", "Đặt điểm vào / ra cho comment theo đoạn"],
            ["X", "Bỏ điểm vào / ra"],
            ["Home / End", "Về đầu / cuối"],
            ["M", "Tắt / bật tiếng"],
            ["F", "Toàn màn hình"],
            ["C", "Viết comment"],
            ["Esc", "Thoát vẽ / bỏ chọn"],
          ].map(([k, d]) => (
            <div key={k} className="contents">
              <kbd className="rounded border border-line-2 bg-bg px-1.5 py-0.5 text-center font-mono text-xs">{k}</kbd>
              <span className="text-mut">{t(d)}</span>
            </div>
          ))}
        </div>
      </Modal>
      {confirmNode}
      <Modal
        open={!!nameAsk}
        onClose={() => {
          nameAsk?.resolve(null);
          setNameAsk(null);
        }}
        title={t("Bạn tên là gì?")}
        width={380}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = nameDraft.trim();
            if (!n) return;
            setGuestName(n);
            nameAsk?.resolve(n);
            setNameAsk(null);
          }}
        >
          <p className="mb-3 text-sm text-mut">{t("Tên sẽ hiện cạnh comment của bạn để nhóm làm việc biết ai góp ý.")}</p>
          <input className="input mb-4" autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={60} placeholder={t("Ví dụ: Chị Hoa - Công ty ABC")} />
          <button className="btn-primary w-full" disabled={!nameDraft.trim()}>
            {t("Tiếp tục")}
          </button>
        </form>
      </Modal>
      {!guest && (
        <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} projectId={project.id} assets={[{ id: asset.id, name: asset.name }]} />
      )}
      <input
        ref={versionInput}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploads?.add([f], { projectId: project.id, folderId: asset.folderId, assetId: asset.id, label: asset.name });
          e.target.value = "";
        }}
      />
    </div>
  );
}
