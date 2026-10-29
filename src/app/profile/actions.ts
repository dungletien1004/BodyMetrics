"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { parseNum } from "@/lib/format";

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
}
