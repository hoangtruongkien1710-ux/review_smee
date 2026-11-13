import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import type { Role } from "@/generated/prisma/client";

export const SESSION_COOKIE = "sr_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  color: string;
  role: Role;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/* ---------- mật khẩu ---------- */

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split(":");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const orig = Buffer.from(hash, "hex");
  return orig.length === test.length && crypto.timingSafeEqual(orig, test);
}

/* ---------- phiên đăng nhập ---------- */

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function cookieSecure() {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export async function createSession(userId: string, userAgent?: string | null) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({
    data: { id: sha(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha(token) } });
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { id: sha(token) },
    include: { user: true },
  });
  if (!s || s.expiresAt < new Date() || s.user.status !== "ACTIVE") return null;
  // cập nhật "hoạt động gần nhất" tối đa 5 phút một lần
  const last = s.user.lastActiveAt?.getTime() ?? 0;
  if (Date.now() - last > 5 * 60_000) {
    await prisma.user.update({ where: { id: s.user.id }, data: { lastActiveAt: new Date() } });
  }
  const u = s.user;
  return { id: u.id, email: u.email, name: u.name, color: u.color, role: u.role };
});

/** Dùng trong trang (server component): chưa đăng nhập thì chuyển về /login. */
export async function requirePageUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Dùng trong API: chưa đăng nhập thì trả lỗi 401. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Bạn cần đăng nhập");
  return u;
}

export function isAdmin(u: Pick<SessionUser, "role">) {
  return u.role === "OWNER" || u.role === "ADMIN";
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (!isAdmin(u)) throw new HttpError(403, "Chỉ quản trị viên mới làm được việc này");
  return u;
}
