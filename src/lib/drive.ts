// Google Drive: đẩy file gốc, tạo thư mục, đổi tên, di chuyển, xoá.
// Không dùng thư viện ngoài, gọi thẳng Drive REST API v3.
// Ba cách xác thực (chọn 1 trong .env):
//   0) Apps Script của chủ thư mục cấp token (thư mục nằm trong "Drive của tôi", dễ nhất):
//      GOOGLE_APPS_SCRIPT_URL, GOOGLE_APPS_SCRIPT_KEY — mã script ở docs/apps-script.gs
//   1) Service account (thư mục nằm trong Shared Drive): GOOGLE_SERVICE_ACCOUNT_JSON
//   2) Tài khoản công ty riêng (thư mục nằm trong "Drive của tôi"):
//      GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN
import crypto from "node:crypto";
import fs from "node:fs";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive";
const ALL = "supportsAllDrives=true";

export function driveEnabled() {
  return (
    !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID &&
    (!!scriptUrl() || !!readServiceAccount() || !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN)
  );
}

const scriptUrl = () => process.env.GOOGLE_APPS_SCRIPT_URL?.trim() || "";

/** Lấy token từ Apps Script web app (chạy dưới tài khoản chủ thư mục). */
async function scriptToken(): Promise<{ token: string; exp: number }> {
  const u = new URL(scriptUrl());
  u.searchParams.set("key", process.env.GOOGLE_APPS_SCRIPT_KEY ?? "");
  const r = await fetch(u, { redirect: "follow" });
  const txt = await r.text();
  let j: { access_token?: string; expires_in?: number; error?: string };
  try {
    j = JSON.parse(txt);
  } catch {
    throw new Error(
      `Apps Script không trả về JSON (HTTP ${r.status}). Kiểm tra đã triển khai "Ứng dụng web", quyền truy cập "Bất kỳ ai", và dùng link kết thúc bằng /exec`,
    );
  }
  if (!j.access_token) throw new Error(`Apps Script từ chối: ${j.error ?? r.status} (kiểm tra GOOGLE_APPS_SCRIPT_KEY khớp SECRET trong script)`);
  return { token: j.access_token, exp: Date.now() + Math.min(j.expires_in ?? 3000, 3000) * 1000 };
}

export function driveRoot() {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
}

type SA = { client_email: string; private_key: string };
function readServiceAccount(): SA | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    // cho phép dán nội dung JSON hoặc đường dẫn tới file JSON
    const txt = raw.startsWith("{") ? raw : fs.readFileSync(raw, "utf8");
    const j = JSON.parse(txt);
    return { client_email: j.client_email, private_key: j.private_key };
  } catch (e) {
    console.error("[drive] GOOGLE_SERVICE_ACCOUNT_JSON không đọc được:", (e as Error).message);
    return null;
  }
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  if (scriptUrl()) {
    cached = await scriptToken();
    return cached.token;
  }
  const sa = readServiceAccount();
  let body: URLSearchParams;
  if (sa) {
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
      iss: sa.client_email,
      scope: SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })}`;
    const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
    body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` });
  } else {
    body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN ?? "",
    });
  }
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google từ chối xác thực: ${j.error_description ?? j.error ?? r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  let r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (r.status === 401) {
    // token hết hạn sớm → lấy token mới, thử lại 1 lần
    cached = null;
    const t2 = await accessToken();
    r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t2}`, ...(init.headers ?? {}) } });
  }
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Drive API ${r.status}: ${t.slice(0, 300)}`);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

export async function createFolder(name: string, parentId: string): Promise<string> {
  const j = await call<{ id: string }>(`${API}/files?${ALL}&fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return j.id;
}

export async function findFolder(name: string, parentId: string): Promise<string | null> {
  const q = `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const j = await call<{ files: { id: string }[] }>(
    `${API}/files?${ALL}&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id)&q=${encodeURIComponent(q)}`,
  );
  return j.files[0]?.id ?? null;
}

export async function ensureFolder(name: string, parentId: string) {
  return (await findFolder(name, parentId)) ?? (await createFolder(name, parentId));
}

export async function rename(fileId: string, name: string) {
  await call(`${API}/files/${fileId}?${ALL}&fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function move(fileId: string, newParentId: string) {
  const f = await call<{ parents?: string[] }>(`${API}/files/${fileId}?${ALL}&fields=parents`);
  const remove = (f.parents ?? []).join(",");
  await call(`${API}/files/${fileId}?${ALL}&fields=id&addParents=${newParentId}${remove ? `&removeParents=${remove}` : ""}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

/** Chuyển vào thùng rác của Google Drive (khôi phục được trong 30 ngày). */
export async function trash(fileId: string) {
  await call(`${API}/files/${fileId}?${ALL}&fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

/** Bỏ file vào Thùng rác của Google Drive (khôi phục được trong 30 ngày), không xoá hẳn. */
export async function remove(fileId: string) {
  await call(`${API}/files/${fileId}?${ALL}&fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

/** Upload file lớn theo kiểu resumable, từng khúc 32 MB. Trả về fileId trên Drive. */
export async function uploadFile(
  localPath: string,
  name: string,
  mimeType: string,
  parentId: string,
  onProgress?: (sent: number, total: number) => void,
): Promise<string> {
  const size = fs.statSync(localPath).size;
  const token = await accessToken();
  const init = await fetch(`${UPLOAD}/files?uploadType=resumable&${ALL}&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({ name, parents: [parentId] }),
  });
  if (!init.ok) throw new Error(`Drive không nhận upload: ${init.status} ${(await init.text()).slice(0, 300)}`);
  const session = init.headers.get("location")!;

  const CHUNK = 32 * 1024 * 1024; // bội số của 256 KB
  const fd = fs.openSync(localPath, "r");
  try {
    let offset = 0;
    if (size === 0) {
      const r = await fetch(session, { method: "PUT", headers: { "Content-Length": "0" } });
      return ((await r.json()) as { id: string }).id;
    }
    while (offset < size) {
      const len = Math.min(CHUNK, size - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      let attempt = 0;
      for (;;) {
        const r = await fetch(session, {
          method: "PUT",
          headers: { "Content-Length": String(len), "Content-Range": `bytes ${offset}-${offset + len - 1}/${size}` },
          body: buf,
        }).catch((e) => e as Error);
        if (r instanceof Error || r.status >= 500) {
          if (++attempt > 5) throw new Error(`Upload lên Drive lỗi: ${r instanceof Error ? r.message : r.status}`);
          await new Promise((res) => setTimeout(res, 2000 * attempt));
          continue;
        }
        if (r.status === 200 || r.status === 201) {
          onProgress?.(size, size);
          return ((await r.json()) as { id: string }).id;
        }
        if (r.status === 308) {
          const range = r.headers.get("range"); // "bytes=0-12345"
          offset = range ? Number(range.split("-")[1]) + 1 : offset + len;
          onProgress?.(offset, size);
          break;
        }
        throw new Error(`Upload lên Drive lỗi ${r.status}: ${(await r.text()).slice(0, 300)}`);
      }
    }
    throw new Error("Upload lên Drive không hoàn tất");
  } finally {
    fs.closeSync(fd);
  }
}

/** Tải file từ Drive (hỗ trợ Range để tua video / tải tiếp). */
export async function download(fileId: string, range?: string | null): Promise<Response> {
  const token = await accessToken();
  return fetch(`${API}/files/${fileId}?alt=media&${ALL}`, {
    headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
  });
}

export async function checkConnection(): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const j = await call<{ name: string }>(`${API}/files/${driveRoot()}?${ALL}&fields=name`);
    return { ok: true, name: j.name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
