import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { hashPassword } from "./password";
import { readSession, SESSION_COOKIE, sessionCookieOptions, signSession } from "./session";

/** The signed-in user, or null. Also rejects sessions issued before a password change. */
export async function getCurrentUser() {
  const claims = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await db.user.findUnique({ where: { id: claims.sub }, select: { id: true, username: true, sessionVer: true } });
  return user && user.sessionVer === claims.ver ? user : null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function startSession(user: { id: string; sessionVer: number }) {
  (await cookies()).set(SESSION_COOKIE, await signSession({ sub: user.id, ver: user.sessionVer }), sessionCookieOptions());
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * First-run account: when no user exists yet, AUTH_USERNAME / AUTH_PASSWORD from the
 * environment become the account. After that the database is the source of truth.
 */
export async function ensureBootstrapUser(): Promise<"exists" | "created" | "missing"> {
  if ((await db.user.count()) > 0) return "exists";
  const username = process.env.AUTH_USERNAME?.trim();
  const password = process.env.AUTH_PASSWORD;
  if (!username || !password) return "missing";
  await db.user.create({ data: { username, passwordHash: await hashPassword(password) } });
  return "created";
}

/**
 * Relative in-app path (query string kept, e.g. the OAuth authorize URL) to return to after
 * login; anything else falls back to "/". "/\" counts as protocol-relative in browsers.
 */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/(?![/\\])/.test(next) && !next.startsWith("/login") ? next : "/";
}
