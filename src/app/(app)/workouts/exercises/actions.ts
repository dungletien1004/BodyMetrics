"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { parseNum } from "@/lib/format";
import { isCategory } from "@/lib/workouts";

export type ExerciseFormState = { error?: string; ok?: string } | undefined;

const validMet = (met: number | null): met is number => met != null && met >= 1 && met <= 25;

export async function createExercise(_prev: ExerciseFormState, form: FormData): Promise<ExerciseFormState> {
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "");
  const met = parseNum(form.get("met"));
  const muscleGroup = String(form.get("muscleGroup") ?? "").trim() || null;

  if (!name) return { error: "Nhập tên bài tập." };
  if (!isCategory(category)) return { error: "Chọn loại bài tập." };
  if (!validMet(met)) return { error: "MET phải trong khoảng 1–25." };
  if (await db.exercise.findUnique({ where: { name } })) return { error: `"${name}" đã có trong thư viện.` };

  await db.exercise.create({ data: { name, category, met, muscleGroup } });
  revalidatePath("/workouts", "layout");
  return { ok: `Đã thêm "${name}".` };
}

export async function updateExerciseMet(id: string, form: FormData) {
  const met = parseNum(form.get("met"));
  if (!validMet(met)) return;
  await db.exercise.update({ where: { id }, data: { met } });
  revalidatePath("/workouts", "layout");
}
