"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exerciseKcal } from "@/lib/calc";
import { isDayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { getWeightOn } from "@/lib/summary";
import { INTENSITIES, type WorkoutPayload } from "@/lib/workouts";
import { getViewer, requireWriter } from "@/lib/auth";
import { analyzeWorkoutPhoto, type AnalyzeWorkoutResult } from "@/lib/ai/workout";
import { hasAiKey } from "@/lib/ai/client";
import { deleteImage, saveImage } from "@/lib/storage";
import { visibleExercises } from "./queries";

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

const payloadSchema = z.object({
  date: z.string().refine(isDayKey),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: num(0, 1440).nullable(),
  kcalOverride: num(0, 10000).nullable(),
  note: z.string().max(2000),
  entries: z
    .array(
      z.object({
        exerciseId: z.string().min(1),
        durationMin: num(0, 1440),
        intensity: z.enum(INTENSITIES),
        distanceKm: num(0, 1000).nullable(),
        sets: z.array(z.object({ reps: num(0, 1000).nullable(), weightKg: num(0, 1000).nullable() })).max(100),
      }),
    )
    .min(1)
    .max(50),
});

export type SaveResult = { error: string } | undefined;

/** Upload a temporary workout image, analyze it against this user's visible exercise library, then discard it. */
export async function analyzeWorkoutImage(form: FormData): Promise<AnalyzeWorkoutResult> {
  const userId = await requireWriter();
  if (!hasAiKey()) {
    return { ok: false, error: "AI trong ứng dụng chưa được bật. Hãy kết nối Claude để gửi ảnh và ghi buổi tập." };
  }

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chưa chọn ảnh buổi tập." };

  const candidates = await db.exercise.findMany({
    where: visibleExercises(userId),
    select: { id: true, name: true, category: true },
  });
  if (!candidates.length) return { ok: false, error: "Thư viện chưa có bài tập để khớp. Hãy thêm bài tập vào thư viện trước." };

  let stored: Awaited<ReturnType<typeof saveImage>> | null = null;
  try {
    stored = await saveImage(file, userId);
    return await analyzeWorkoutPhoto(stored.path, userId, candidates);
  } catch (err) {
    console.error("analyzeWorkoutImage failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Không lưu được ảnh buổi tập." };
  } finally {
    if (stored) await deleteImage(stored.path, userId).catch((err) => console.error("workout image cleanup failed", err));
  }
}

/** Create (id = null) or replace a workout. Every entry's kcal is recomputed here from MET and weight. */
export async function saveWorkout(id: string | null, input: WorkoutPayload): Promise<SaveResult> {
  const userId = await requireWriter();
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return { error: "Dữ liệu chưa hợp lệ - kiểm tra lại ngày, giờ và các bài tập." };
  const p = parsed.data;

  const ids = [...new Set(p.entries.map((e) => e.exerciseId))];
  const exercises = await db.exercise.findMany({
    where: { id: { in: ids }, ...visibleExercises(userId) },
    select: { id: true, met: true },
  });
  const metById = new Map(exercises.map((e) => [e.id, e.met]));
  if (metById.size !== ids.length) return { error: "Có bài tập không còn trong thư viện." };

  const weight = await getWeightOn(userId, p.date);
  const entries = p.entries.map((e, i) => {
    const sets = e.sets
      .filter((s) => s.reps != null || s.weightKg != null)
      .map((s, j) => ({ setNo: j + 1, reps: s.reps == null ? null : Math.round(s.reps), weightKg: s.weightKg }));
    return {
      exerciseId: e.exerciseId,
      order: i,
      durationMin: e.durationMin,
      intensity: e.intensity,
      distanceKm: e.distanceKm || null,
      kcal: exerciseKcal(metById.get(e.exerciseId)!, weight, e.durationMin, e.intensity),
      sets: { create: sets },
    };
  });

  const data = {
    date: p.date,
    startedAt: new Date(`${p.date}T${p.startTime}:00`), // local time
    durationMin: Math.round(p.durationMin ?? p.entries.reduce((a, e) => a + e.durationMin, 0)),
    kcalOverride: p.kcalOverride || null,
    note: p.note.trim() || null,
  };

  let workoutId = id;
  if (id) {
    const exists = await db.workout.findFirst({ where: { id, userId }, select: { id: true } });
    if (!exists) return { error: "Buổi tập không còn tồn tại." };
    await db.$transaction([
      db.workoutEntry.deleteMany({ where: { workoutId: id } }),
      db.workout.update({ where: { id }, data: { ...data, entries: { create: entries } } }),
    ]);
  } else {
    workoutId = (await db.workout.create({ data: { ...data, userId, entries: { create: entries } } })).id;
  }

  revalidatePath("/", "layout");
  redirect(`/workouts/${workoutId}`);
}

export async function deleteWorkout(id: string, redirectTo?: string) {
  const userId = await requireWriter();
  await db.workout.deleteMany({ where: { id, userId } });
  revalidatePath("/", "layout");
  if (redirectTo?.startsWith("/workouts")) redirect(redirectTo);
}

/** Weight the server will use for a day, so the builder preview matches the saved numbers. */
export async function weightForDay(date: string): Promise<number | null> {
  const { userId } = await getViewer();
  return isDayKey(date) ? getWeightOn(userId, date) : null;
}
