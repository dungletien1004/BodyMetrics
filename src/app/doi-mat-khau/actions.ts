"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, safeNext, startSession } from "@/lib/auth";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { revokeAllForUser } from "@/lib/oauth/tokens";

export type ChangeState = { error: string; field?: "password" | "confirm" } | null;

/** Replace the admin-set password with the user's own, then continue to `next`. */
export async function setOwnPassword(_prev: ChangeState, form: FormData): Promise<ChangeState> {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const next = safeNext(form.get("next"));

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Mật khẩu mới cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`, field: "password" };
  }
  if (password !== confirm) return { error: "Hai lần nhập không khớp.", field: "confirm" };

  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (await verifyPassword(password, user.passwordHash)) {
    return { error: "Hãy chọn mật khẩu khác với mật khẩu quản trị viên đã đặt.", field: "password" };
  }

  // New session version: any other device still on the admin-set password is signed out,
  // this browser gets a fresh cookie, and connector grants made before now are revoked.
  const updated = await db.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false, sessionVer: { increment: 1 } },
  });
  await startSession(updated);
  await revokeAllForUser(updated.id);
  redirect(next);
}
