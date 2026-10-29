"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AnalyzePhotoResult, MealInput } from "@/components/meals/types";
import { MEAL_TYPES } from "@/components/meals/types";
import { analyzeFoodPhoto } from "@/lib/ai/food";
import { hasAiKey } from "@/lib/ai/client";
import { isDayKey, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { deleteImage, saveImage, uploadUrl } from "@/lib/storage";

const num = z.number().finite().min(0).max(100000);

const MealInputSchema = z.object({
  date: z.string().refine(isDayKey),
  type: z.enum(MEAL_TYPES.map((t) => t.value) as [string, ...string[]]),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  note: z.string().max(1000),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        portionG: num.nullable(),
        kcal: num,
        proteinG: num,
        carbG: num,
        fatG: num,
        source: z.enum(["ai", "manual"]),
        confidence: z.number().min(0).max(1).nullable(),
      }),
    )
    .min(1),
  photoId: z.string().nullable(),
  aiRaw: z.string().nullable(),
});

function revalidateAll() {
  // Meals feed the dashboard, analytics and gallery too.
  revalidatePath("/", "layout");
}

/** Upload a food photo, store it, and (when a key is configured) ask the AI what is on it. */
export async function analyzePhoto(form: FormData): Promise<AnalyzePhotoResult> {
  const file = form.get("photo");
  const hint = String(form.get("hint") ?? "");
  const dateField = form.get("date");
  const date = isDayKey(dateField) ? dateField : todayKey();
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chưa chọn ảnh." };
  await cleanupAbandonedPhotos().catch((err) => console.error("cleanupAbandonedPhotos failed", err));

  let photo;
  try {
    const stored = await saveImage(file);
    photo = await db.photo.create({
      data: { kind: "food", path: stored.path, width: stored.width, height: stored.height, date },
    });
  } catch (err) {
    console.error("analyzePhoto: save failed", err);
    return { ok: false, error: err instanceof Error && err.message ? err.message : "Không lưu được ảnh." };
  }

  const base = { ok: true as const, photoId: photo.id, photoUrl: uploadUrl(photo.path) };
  // Upload-only: the editor saves a picked photo that was never analyzed.
  if (form.get("skipAi") === "1") return { ...base, items: [], notes: null, aiRaw: null, warning: null };
  if (!hasAiKey()) {
    return {
      ...base,
      items: [],
      notes: null,
      aiRaw: null,
      warning: "Chưa cấu hình ANTHROPIC_API_KEY nên AI không phân tích được. Ảnh đã được lưu - hãy nhập món ăn bằng tay.",
    };
  }

  const result = await analyzeFoodPhoto(photo.path, hint);
  if (!result.ok) return { ...base, items: [], notes: null, aiRaw: null, warning: `${result.error} Ảnh đã được lưu.` };

  const { analysis } = result;
  return {
    ...base,
    items: analysis.items.map((i) => ({
      name: i.name,
      portionG: i.portionG,
      kcal: i.kcal,
      proteinG: i.proteinG,
      carbG: i.carbG,
      fatG: i.fatG,
      source: "ai",
      confidence: i.confidence,
    })),
    notes: [analysis.notes, ...analysis.items.filter((i) => i.note).map((i) => `${i.name}: ${i.note}`)]
      .filter(Boolean)
      .join("\n") || null,
    aiRaw: result.raw,
    warning: analysis.items.length === 0 ? `AI không thấy món ăn nào${analysis.noFoodReason ? `: ${analysis.noFoodReason}` : "."}` : null,
  };
}

/** Food photos uploaded more than a day ago whose meal was never saved. */
async function cleanupAbandonedPhotos() {
  const stale = await db.photo.findMany({
    where: { kind: "food", mealId: null, bodyLogId: null, takenAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
  });
  if (!stale.length) return;
  await db.photo.deleteMany({ where: { id: { in: stale.map((p) => p.id) } } });
  await Promise.all(stale.map((p) => deleteImage(p.path)));
}

/** Delete a photo uploaded for a meal that was never saved. Linked photos are left alone. */
export async function discardPhoto(photoId: string): Promise<void> {
  const photo = await db.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.mealId || photo.bodyLogId || photo.kind !== "food") return;
  await db.photo.delete({ where: { id: photoId } });
  await deleteImage(photo.path);
}

function parseMeal(input: MealInput) {
  const parsed = MealInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const m = parsed.data;
  const eatenAt = new Date(`${m.date}T${m.time}:00`);
  return {
    meal: {
      date: m.date,
      type: m.type,
      eatenAt: Number.isNaN(eatenAt.getTime()) ? new Date() : eatenAt,
      note: m.note.trim() || null,
    },
    items: m.items.map((i) => ({ ...i, name: i.name.trim() })),
    photoId: m.photoId,
    aiRaw: m.aiRaw,
  };
}

export type SaveMealResult = { error: string } | undefined;

export async function createMeal(input: MealInput): Promise<SaveMealResult> {
  const p = parseMeal(input);
  if (!p) return { error: "Dữ liệu chưa hợp lệ. Mỗi bữa cần ít nhất một món có tên." };

  await db.$transaction(async (tx) => {
    const meal = await tx.meal.create({
      data: { ...p.meal, aiRaw: p.aiRaw, items: { create: p.items } },
    });
    if (p.photoId) {
      await tx.photo.updateMany({ where: { id: p.photoId, mealId: null }, data: { mealId: meal.id, date: p.meal.date } });
    }
  });

  revalidateAll();
  redirect(`/meals?date=${p.meal.date}`);
}

export async function updateMeal(id: string, input: MealInput): Promise<SaveMealResult> {
  const p = parseMeal(input);
  if (!p) return { error: "Dữ liệu chưa hợp lệ. Mỗi bữa cần ít nhất một món có tên." };

  const exists = await db.meal.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { error: "Bữa ăn không còn tồn tại." };

  await db.$transaction([
    db.mealItem.deleteMany({ where: { mealId: id } }),
    db.meal.update({ where: { id }, data: { ...p.meal, items: { create: p.items } } }),
    // Keep linked photos on the meal's day if the date changed.
    db.photo.updateMany({ where: { mealId: id }, data: { date: p.meal.date } }),
  ]);

  revalidateAll();
  redirect(`/meals?date=${p.meal.date}`);
}

/** Delete a meal with its items, photo rows and photo files. */
export async function deleteMeal(id: string, redirectTo?: string): Promise<void> {
  const meal = await db.meal.findUnique({ where: { id }, include: { photos: true } });
  if (meal) {
    await db.$transaction([
      db.photo.deleteMany({ where: { mealId: id } }),
      db.meal.delete({ where: { id } }), // items cascade
    ]);
    await Promise.all(meal.photos.map((ph) => deleteImage(ph.path)));
  }
  revalidateAll();
  if (redirectTo?.startsWith("/meals")) redirect(redirectTo);
}
