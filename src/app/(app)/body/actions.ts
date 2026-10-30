"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isDayKey, todayKey } from "@/lib/dates";
import { parseNum } from "@/lib/format";
import { deleteImage, saveImage } from "@/lib/storage";
import { getViewer, requireWriter } from "@/lib/auth";

export type BodyFormState = { ok: boolean; message: string } | null;

export async function addBodyLog(_prev: BodyFormState, form: FormData): Promise<BodyFormState> {
  const viewer = await getViewer();
  if (viewer.readOnly) return { ok: false, message: "Đang ở chế độ chỉ xem, không thể thêm dữ liệu." };
  const userId = viewer.userId;
  const date = isDayKey(form.get("date")) ? (form.get("date") as string) : todayKey();
  const weightKg = parseNum(form.get("weightKg"));
  const waistCm = parseNum(form.get("waistCm"));
  const bodyFatPct = parseNum(form.get("bodyFatPct"));
  const note = String(form.get("note") ?? "").trim() || null;
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (weightKg == null && waistCm == null && bodyFatPct == null && !files.length && !note) {
    return { ok: false, message: "Nhập ít nhất một chỉ số hoặc ảnh." };
  }
  if (weightKg != null && (weightKg < 25 || weightKg > 350)) return { ok: false, message: "Cân nặng không hợp lệ." };

  try {
    const stored = await Promise.all(files.map((f) => saveImage(f, userId)));
    await db.bodyLog.create({
      data: {
        userId,
        date,
        weightKg,
        waistCm,
        bodyFatPct,
        note,
        photos: { create: stored.map((s) => ({ ...s, userId, kind: "body", date })) },
      },
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Không lưu được." };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Đã lưu." };
}

export async function deleteBodyLog(form: FormData) {
  const userId = await requireWriter();
  const id = String(form.get("id") ?? "");
  const log = await db.bodyLog.findFirst({ where: { id, userId }, include: { photos: true } });
  if (!log) return;
  await db.$transaction([db.photo.deleteMany({ where: { bodyLogId: id } }), db.bodyLog.delete({ where: { id } })]);
  await Promise.all(log.photos.map((p) => deleteImage(p.path, userId)));
  revalidatePath("/", "layout");
}
