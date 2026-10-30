"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { parseNum } from "@/lib/format";
import { isCategory } from "@/lib/workouts";
import { getViewer } from "@/lib/auth";
import { visibleExercises } from "../queries";

export type ExerciseFormState = { error?: string; ok?: string } | undefined;

const validMet = (met: number | null): met is number => met != null && met >= 1 && met <= 25;

export async function createExercise(_prev: ExerciseFormState, form: FormData): Promise<ExerciseFormState> {
  const viewer = await getViewer();
  if (viewer.readOnly) return { error: "Đang ở chế độ chỉ xem." };
  const userId = viewer.userId;
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "");
  const met = parseNum(form.get("met"));
  const muscleGroup = String(form.get("muscleGroup") ?? "").trim() || null;

  if (!name) return { error: "Nhập tên bài tập." };
  if (!isCategory(category)) return { error: "Chọn loại bài tập." };
  if (!validMet(met)) return { error: "MET phải trong khoảng 1–25." };
  const clash = await db.exercise.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...visibleExercises(userId) },
  });
  if (clash) return { error: `"${name}" đã có trong thư viện.` };

  await db.exercise.create({ data: { userId, name, category, met, muscleGroup } });
  revalidatePath("/workouts", "layout");
  return { ok: `Đã thêm "${name}".` };
}

/** Users edit their own exercises; the shared library is admin-only. */
export async function updateExerciseMet(id: string, form: FormData) {
  const viewer = await getViewer();
  if (viewer.readOnly) return;
  const met = parseNum(form.get("met"));
  if (!validMet(met)) return;
  const owned = viewer.user.role === "admin" ? { OR: [{ userId: null }, { userId: viewer.userId }] } : { userId: viewer.userId };
  await db.exercise.updateMany({ where: { id, ...owned }, data: { met } });
  revalidatePath("/workouts", "layout");
}
