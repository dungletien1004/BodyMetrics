import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { hashPassword } from "./password";
import { readSession, SESSION_COOKIE, sessionCookieOptions, signSession } from "./session";

export type Role = "admin" | "user";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  sessionVer: number;
}

/** Admins can open another user's data read-only; the target user id lives in this cookie. */
export const VIEW_AS_COOKIE = "bm_view_as";

/** The signed-in user, or null. Rejects inactive users and sessions issued before a password change. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const claims = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, username: true, name: true, role: true, active: true, sessionVer: true },
  });
  if (!user || !user.active || user.sessionVer !== claims.ver) return null;
  return { id: user.id, username: user.username, name: user.name, role: user.role === "admin" ? "admin" : "user", sessionVer: user.sessionVer };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export interface Viewer {
  user: SessionUser; // who is signed in
  userId: string; // whose data the pages show and actions write
  readOnly: boolean; // true while an admin views someone else's data
  viewingAs: { id: string; username: string; name: string } | null;
}

/**
 * Whose data to show. Normally the signed-in user; for an admin with the view-as cookie set,
 * the chosen user, read-only. Every page and query scopes by `viewer.userId`.
 */
export async function getViewer(): Promise<Viewer> {
  const user = await requireUser();
  const viewAsId = user.role === "admin" ? (await cookies()).get(VIEW_AS_COOKIE)?.value : undefined;
  if (viewAsId && viewAsId !== user.id) {
    const target = await db.user.findUnique({ where: { id: viewAsId }, select: { id: true, username: true, name: true } });
    if (target) return { user, userId: target.id, readOnly: true, viewingAs: target };
  }
  return { user, userId: user.id, readOnly: false, viewingAs: null };
}

export class ReadOnlyError extends Error {
  constructor() {
    super("Đang ở chế độ chỉ xem dữ liệu của người khác, không thể thay đổi.");
  }
}

/** For server actions that change data: the owner id to write as. Throws in view-as mode. */
export async function requireWriter(): Promise<string> {
  const viewer = await getViewer();
  if (viewer.readOnly) throw new ReadOnlyError();
  return viewer.userId;
}

/** Admin only: show `userId`'s data read-only across the app. */
export async function startViewAs(userId: string) {
  await requireAdmin();
  (await cookies()).set(VIEW_AS_COOKIE, userId, { ...sessionCookieOptions(), maxAge: 8 * 3600 });
}

export async function stopViewAs() {
  (await cookies()).delete(VIEW_AS_COOKIE);
}

export async function startSession(user: { id: string; sessionVer: number }) {
  (await cookies()).set(SESSION_COOKIE, await signSession({ sub: user.id, ver: user.sessionVer }), sessionCookieOptions());
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(VIEW_AS_COOKIE);
}

/**
 * First-run account: when no user exists yet, AUTH_USERNAME / AUTH_PASSWORD from the
 * environment become the first admin. After that, admins create accounts in /admin.
 */
export async function ensureBootstrapUser(): Promise<"exists" | "created" | "missing"> {
  if ((await db.user.count()) > 0) return "exists";
  const username = process.env.AUTH_USERNAME?.trim();
  const password = process.env.AUTH_PASSWORD;
  if (!username || !password) return "missing";
  await db.user.create({ data: { username, role: "admin", passwordHash: await hashPassword(password) } });
  return "created";
}

/** Relative in-app path (query kept) to return to after login; anything else falls back to "/". */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}
