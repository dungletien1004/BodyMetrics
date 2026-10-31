"use server";

import { format } from "date-fns";
import type { MealItem } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { MealInput } from "@/components/meals/types";
import { isMealType, MEAL_TYPES } from "@/components/meals/types";
import { requireWriter } from "@/lib/auth";
import { isDayKey, shiftDay, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { hasDuplicateMealItems } from "@/lib/meals";
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
});

function revalidateAll() {
  // Meals feed the dashboard, analytics and gallery too.
  revalidatePath("/", "layout");
}

export type UploadMealPhotoResult = { ok: false; error: string } | { ok: true; photoId: string; photoUrl: string };

/** Store a food photo for the meal. Analysis is done in Claude Web through the MCP connector. */
export async function uploadMealPhoto(form: FormData): Promise<UploadMealPhotoResult> {
  const file = form.get("photo");
  const dateField = form.get("date");
  const date = isDayKey(dateField) ? dateField : todayKey();
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chưa chọn ảnh." };
  const userId = await requireWriter();
  await cleanupAbandonedPhotos(userId).catch((err) => console.error("cleanupAbandonedPhotos failed", err));

  let photo;
  try {
    const stored = await saveImage(file, userId);
    photo = await db.photo.create({
      data: { userId, kind: "food", path: stored.path, width: stored.width, height: stored.height, date },
    });
  } catch (err) {
    console.error("uploadMealPhoto failed", err);
    return { ok: false, error: err instanceof Error && err.message ? err.message : "Không lưu được ảnh." };
  }

  return { ok: true, photoId: photo.id, photoUrl: uploadUrl(photo.path) };
}

/** Food photos uploaded more than a day ago whose meal was never saved. */
async function cleanupAbandonedPhotos(userId: string) {
  const stale = await db.photo.findMany({
    where: { userId, kind: "food", mealId: null, bodyLogId: null, takenAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
  });
  if (!stale.length) return;
  await db.photo.deleteMany({ where: { id: { in: stale.map((p) => p.id) } } });
  await Promise.all(stale.map((p) => deleteImage(p.path, userId)));
}

/** Delete a photo uploaded for a meal that was never saved. Linked photos are left alone. */
export async function discardPhoto(photoId: string): Promise<void> {
  const userId = await requireWriter();
  const photo = await db.photo.findFirst({ where: { id: photoId, userId } });
  if (!photo || photo.mealId || photo.bodyLogId || photo.kind !== "food") return;
  await db.photo.delete({ where: { id: photoId } });
  await deleteImage(photo.path, userId);
}

type ParsedMeal = {
  meal: { date: string; type: z.infer<typeof MealInputSchema>["type"]; eatenAt: Date; note: string | null };
  items: z.infer<typeof MealInputSchema>["items"];
  photoId: string | null;
};

type ParseMealResult = { ok: false; error: string } | { ok: true; data: ParsedMeal };

function parseMeal(input: MealInput): ParseMealResult {
  const parsed = MealInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu chưa hợp lệ. Mỗi bữa cần ít nhất một món có tên." };
  const m = parsed.data;
  if (hasDuplicateMealItems(m.items)) {
    return { ok: false, error: "Có hai dòng món giống hệt nhau. Hãy gộp khẩu phần vào một dòng hoặc chỉnh lại số liệu." };
  }
  const eatenAt = new Date(`${m.date}T${m.time}:00`);
  return {
    ok: true,
    data: {
      meal: {
        date: m.date,
        type: m.type,
        eatenAt: Number.isNaN(eatenAt.getTime()) ? new Date() : eatenAt,
        note: m.note.trim() || null,
      },
      items: m.items.map((i) => ({ ...i, name: i.name.trim() })),
      photoId: m.photoId,
    },
  };
}

export type SaveMealResult = { error: string } | undefined;

export type MealPhotoResult = { ok: true; added: number } | { ok: false; error: string };

const MAX_PHOTOS_PER_MEAL = 6;

/** Attach one or more photos to an already saved meal (e.g. one logged through Claude). */
export async function addMealPhotos(mealId: string, form: FormData): Promise<MealPhotoResult> {
  const userId = await requireWriter();
  const meal = await db.meal.findFirst({ where: { id: mealId, userId }, select: { id: true, date: true, _count: { select: { photos: true } } } });
  if (!meal) return { ok: false, error: "Không tìm thấy bữa ăn." };
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "Chưa chọn ảnh." };
  if (meal._count.photos + files.length > MAX_PHOTOS_PER_MEAL) {
    return { ok: false, error: `Mỗi bữa tối đa ${MAX_PHOTOS_PER_MEAL} ảnh.` };
  }
  try {
    for (const file of files) {
      const stored = await saveImage(file, userId);
      await db.photo.create({ data: { ...stored, userId, kind: "food", date: meal.date, mealId: meal.id } });
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message ? err.message : "Không lưu được ảnh." };
  }
  revalidateAll();
  return { ok: true, added: files.length };
}

/** Remove one photo from a saved meal, with its stored image. */
export async function removeMealPhoto(photoId: string): Promise<void> {
  const userId = await requireWriter();
  const photo = await db.photo.findFirst({ where: { id: photoId, userId, mealId: { not: null } } });
  if (!photo) return;
  await db.photo.delete({ where: { id: photo.id } });
  await deleteImage(photo.path, userId);
  revalidateAll();
}

export async function createMeal(input: MealInput): Promise<SaveMealResult> {
  const userId = await requireWriter();
  const result = parseMeal(input);
  if (!result.ok) return { error: result.error };
  const p = result.data;

  await db.$transaction(async (tx) => {
    const meal = await tx.meal.create({
      data: { ...p.meal, userId, aiRaw: null, items: { create: p.items } },
    });
    if (p.photoId) {
      await tx.photo.updateMany({ where: { id: p.photoId, userId, mealId: null }, data: { mealId: meal.id, date: p.meal.date } });
    }
  });

  revalidateAll();
  redirect(`/meals?date=${p.meal.date}`);
}

export async function updateMeal(id: string, input: MealInput): Promise<SaveMealResult> {
  const userId = await requireWriter();
  const result = parseMeal(input);
  if (!result.ok) return { error: result.error };
  const p = result.data;

  const exists = await db.meal.findFirst({ where: { id, userId }, select: { id: true } });
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
  const userId = await requireWriter();
  const meal = await db.meal.findFirst({ where: { id, userId }, include: { photos: true } });
  if (meal) {
    await db.$transaction([
      db.photo.deleteMany({ where: { mealId: id } }),
      db.meal.delete({ where: { id } }), // items cascade
    ]);
    await Promise.all(meal.photos.map((ph) => deleteImage(ph.path, userId)));
  }
  revalidateAll();
  if (redirectTo?.startsWith("/meals")) redirect(redirectTo);
}

const copyItems = (items: MealItem[]) =>
  items.map((i) => ({
    name: i.name,
    portionG: i.portionG,
    kcal: i.kcal,
    proteinG: i.proteinG,
    carbG: i.carbG,
    fatG: i.fatG,
    source: i.source,
    confidence: i.confidence,
  }));

/** "Ăn lại": copy a meal's items into a new meal today, at the current time. Photos and notes stay with the original. */
export async function repeatMeal(id: string): Promise<SaveMealResult> {
  const userId = await requireWriter();
  const src = await db.meal.findFirst({ where: { id, userId }, include: { items: true } });
  if (!src) return { error: "Bữa ăn không còn tồn tại." };
  if (!src.items.length) return { error: "Bữa ăn này không có món nào." };
  const date = todayKey();
  await db.meal.create({ data: { userId, date, type: src.type, eatenAt: new Date(), items: { create: copyItems(src.items) } } });
  revalidateAll();
  redirect(`/meals?date=${date}`);
}

/** Copy the previous day's meals of one type onto `date`, keeping their time of day. */
export async function repeatPreviousDay(date: string, type: string): Promise<SaveMealResult> {
  const userId = await requireWriter();
  if (!isDayKey(date) || !isMealType(type)) return { error: "Dữ liệu chưa hợp lệ." };
  const src = await db.meal.findMany({
    where: { userId, date: shiftDay(date, -1), type, items: { some: {} } },
    include: { items: true },
    orderBy: { eatenAt: "asc" },
  });
  if (!src.length) return { error: "Hôm trước không có bữa này." };
  await db.$transaction(
    src.map((m) => {
      const eatenAt = new Date(`${date}T${format(m.eatenAt, "HH:mm")}:00`);
      return db.meal.create({ data: { userId, date, type, eatenAt, items: { create: copyItems(m.items) } } });
    }),
  );
  revalidateAll();
  redirect(`/meals?date=${date}`);
}
