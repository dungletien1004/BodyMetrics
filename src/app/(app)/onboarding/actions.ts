"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { ACTIVITY_LEVELS, deficitForPace, PACES } from "@/lib/calc";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/dates";
import { parseNum } from "@/lib/format";

export type OnboardingState = { error: string } | null;

/** Last step of /onboarding: save the profile, log today's weight, mark the user onboarded. */
export async function finishOnboarding(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const viewer = await getViewer();
  if (viewer.readOnly) return { error: "Đang ở chế độ chỉ xem, không thể lưu." };
  const userId = viewer.userId;

  const sex = form.get("sex");
  const birthYear = parseNum(form.get("birthYear"));
  const heightCm = parseNum(form.get("heightCm"));
  const weightKg = parseNum(form.get("weightKg"));
  const goalWeightKg = parseNum(form.get("goalWeightKg"));
  const activityFactor = parseNum(form.get("activityFactor"));
  const pace = parseNum(form.get("pace"));
  const thisYear = new Date().getFullYear();

  if (sex !== "male" && sex !== "female") return { error: "Chọn giới tính." };
  if (birthYear == null || birthYear < 1920 || birthYear > thisYear - 10) return { error: "Năm sinh không hợp lệ." };
  if (heightCm == null || heightCm < 100 || heightCm > 250) return { error: "Chiều cao không hợp lệ (100–250 cm)." };
  if (weightKg == null || weightKg < 25 || weightKg > 350) return { error: "Cân nặng không hợp lệ." };
  if (goalWeightKg == null || goalWeightKg < 25 || goalWeightKg >= weightKg) {
    return { error: "Cân nặng mục tiêu cần thấp hơn cân nặng hiện tại." };
  }
  const activity = ACTIVITY_LEVELS.find((a) => a.value === activityFactor);
  if (!activity) return { error: "Chọn mức vận động." };
  const chosenPace = PACES.find((p) => p.kgPerWeek === pace);
  if (!chosenPace) return { error: "Chọn tốc độ giảm." };

  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const data = {
    sex,
    birthYear: Math.round(birthYear),
    heightCm,
    goalWeightKg,
    activityFactor: activity.value,
    dailyDeficit: deficitForPace(chosenPace.kgPerWeek),
    onboardedAt: new Date(),
    ...(name ? { name } : {}),
  };
  const today = todayKey();

  await db.$transaction(async (tx) => {
    await tx.profile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    // Today's weigh-in is the start weight; don't add a second identical one if it is already there.
    const existing = await tx.bodyLog.findFirst({ where: { userId, date: today, weightKg } });
    if (!existing) await tx.bodyLog.create({ data: { userId, date: today, weightKg } });
  });

  revalidatePath("/", "layout");
  redirect("/");
}
