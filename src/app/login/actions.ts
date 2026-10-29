"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { endSession, ensureBootstrapUser, safeNext, startSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";

// `username` is echoed back so the field survives React's form reset after a failed attempt.
export type LoginState = { error: string; username?: string } | null;

// Simple in-memory brute-force guard: 5 failures per IP per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

function isBlocked(ip: string): boolean {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

function recordFailure(ip: string) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const ip = clientIp(await headers());
  if (isBlocked(ip)) return { error: "Sai quá nhiều lần. Thử lại sau 15 phút." };

  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "Nhập tên đăng nhập và mật khẩu." };

  if ((await ensureBootstrapUser()) === "missing") {
    return { error: "Chưa có tài khoản. Đặt AUTH_USERNAME và AUTH_PASSWORD trong biến môi trường, hoặc chạy npm run user:set." };
  }

  const user = await db.user.findUnique({ where: { username } });
  // Verify even when the user is unknown so timing does not reveal valid usernames.
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!user || !ok) {
    recordFailure(ip);
    return { error: "Sai tên đăng nhập hoặc mật khẩu.", username };
  }

  failures.delete(ip);
  await startSession(user);
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  await endSession();
  redirect("/login");
}
