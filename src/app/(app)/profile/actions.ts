"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, startSession } from "@/lib/auth";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { parseNum } from "@/lib/format";

export type PasswordState = { ok?: string; error?: string } | null;

/** Change the password; every other signed-in device is signed out. */
export async function changePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const me = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (next.length < MIN_PASSWORD_LENGTH) return { error: `Mật khẩu mới cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` };
  if (next !== confirm) return { error: "Hai lần nhập mật khẩu mới không khớp." };

  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Mật khẩu hiện tại không đúng." };

  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), sessionVer: { increment: 1 } },
  });
  await startSession(updated);
  return { ok: "Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại." };
}

export async function saveProfile(form: FormData) {
  const sex = form.get("sex") === "female" ? "female" : "male";
  const clamp = (v: number | null, min: number, max: number, fallback: number) =>
    v == null ? fallback : Math.min(max, Math.max(min, v));

  const data = {
    name: String(form.get("name") ?? "").trim(),
    sex,
    birthYear: Math.round(clamp(parseNum(form.get("birthYear")), 1920, new Date().getFullYear() - 10, 1995)),
    heightCm: clamp(parseNum(form.get("heightCm")), 100, 250, 170),
    activityFactor: clamp(parseNum(form.get("activityFactor")), 1.1, 1.6, 1.2),
    startWeightKg: parseNum(form.get("startWeightKg")),
    goalWeightKg: parseNum(form.get("goalWeightKg")),
    dailyDeficit: Math.round(clamp(parseNum(form.get("dailyDeficit")), 0, 1000, 500)),
    proteinPerKg: clamp(parseNum(form.get("proteinPerKg")), 0.8, 3, 1.8),
  };

  await db.profile.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}
