"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, startSession, startViewAs, stopViewAs, type SessionUser } from "@/lib/auth";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { countOtherActiveAdmins } from "@/lib/admin";
import { db } from "@/lib/db";
import { USERNAME_RE } from "./password";
import { revokeAllForUser } from "@/lib/oauth/tokens";

export type AdminFormState = { ok?: string; error?: string; password?: string; username?: string; userId?: string } | null;

function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

function readRole(v: FormDataEntryValue | null): "admin" | "user" {
  return v === "admin" ? "admin" : "user";
}

function passwordError(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH ? `Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` : null;
}

/**
 * Locking, demoting and deleting take an account's admin rights away. Refuse it on yourself and
 * on the last active admin, so the app always keeps someone who can manage it.
 */
async function guardRemoval(
  me: SessionUser,
  target: { id: string; role: string; active: boolean },
  verb: string,
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  if (target.id === me.id) return `Bạn không thể ${verb} chính tài khoản của mình.`;
  if (target.role === "admin" && target.active && (await countOtherActiveAdmins(target.id, tx)) === 0) {
    return `Không thể ${verb} quản trị viên đang hoạt động cuối cùng.`;
  }
  return null;
}

export async function createUser(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const role = readRole(form.get("role"));
  const password = String(form.get("password") ?? "");

  if (!USERNAME_RE.test(username)) {
    return { error: "Tên đăng nhập gồm 3–32 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang." };
  }
  const pwError = passwordError(password);
  if (pwError) return { error: pwError };
  if (await db.user.findUnique({ where: { username }, select: { id: true } })) {
    return { error: `Tên đăng nhập "${username}" đã có người dùng.` };
  }

  try {
    const user = await db.user.create({
      data: { username, name, role, passwordHash: await hashPassword(password), profile: { create: { name } } },
    });
    revalidateAdmin();
    return { ok: "Đã tạo tài khoản.", username, password, userId: user.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: `Tên đăng nhập "${username}" đã có người dùng.` };
    }
    throw e;
  }
}

export async function updateUser(userId: string, _prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const role = readRole(form.get("role"));

  const error = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) return "Không tìm thấy tài khoản.";
    if (target.role === "admin" && role !== "admin") {
      const blocked = await guardRemoval(me, target, "hạ quyền", tx);
      if (blocked) return blocked;
    }
    await tx.user.update({ where: { id: userId }, data: { name, role } });
    return null;
  });
  if (error) return { error };
  revalidateAdmin();
  return { ok: "Đã lưu." };
}

/** Set a new password (typed or generated) and sign the user out everywhere. */
export async function resetPassword(userId: string, _prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const password = String(form.get("password") ?? "");
  const pwError = passwordError(password);
  if (pwError) return { error: pwError };

  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return { error: "Không tìm thấy tài khoản." };
  const updated = await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), sessionVer: { increment: 1 } },
  });
  await revokeAllForUser(updated.id);
  // Resetting your own password here should not sign you out of this browser.
  if (updated.id === me.id) await startSession(updated);
  revalidateAdmin();
  return { ok: "Đã đặt mật khẩu mới. Người dùng đã bị đăng xuất khỏi mọi thiết bị.", password };
}

/** Lock (also signs the user out) or unlock an account. */
export async function setActive(userId: string, active: boolean): Promise<AdminFormState> {
  const me = await requireAdmin();
  const error = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) return "Không tìm thấy tài khoản.";
    if (!active) {
      const blocked = await guardRemoval(me, target, "khóa", tx);
      if (blocked) return blocked;
    }
    await tx.user.update({
      where: { id: userId },
      data: active ? { active: true } : { active: false, sessionVer: { increment: 1 } },
    });
    return null;
  });
  if (error) return { error };
  if (!active) await revokeAllForUser(userId);
  revalidateAdmin();
  return { ok: active ? "Đã mở khóa tài khoản." : "Đã khóa tài khoản và đăng xuất người dùng." };
}

/** Delete an account and all of its data. The admin must type the username to confirm. */
export async function deleteUser(userId: string, _prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const confirm = String(form.get("confirm") ?? "").trim();

  const result = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) return { error: "Không tìm thấy tài khoản." };
    if (confirm !== target.username) return { error: `Gõ đúng "${target.username}" để xác nhận.` };
    const blocked = await guardRemoval(me, target, "xóa", tx);
    if (blocked) return { error: blocked };
    // Every personal table cascades from User.
    await tx.user.delete({ where: { id: userId } });
    return { username: target.username };
  }, { timeout: 30_000 }); // photo bytes live in the database, so a big account takes a while
  if ("error" in result) return { error: result.error };
  revalidateAdmin();
  redirect(`/admin?deleted=${encodeURIComponent(result.username)}`);
}

/** Open the user app showing `userId`'s data read-only. Your own account opens normally. */
export async function viewAs(userId: string) {
  const me = await requireAdmin();
  if (userId === me.id) {
    await stopViewAs();
  } else {
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) redirect("/admin");
    await startViewAs(target.id);
  }
  redirect("/");
}

/** Back to the user app with your own data (leaves any view-as). */
export async function openMyApp() {
  await requireAdmin();
  await stopViewAs();
  redirect("/");
}
