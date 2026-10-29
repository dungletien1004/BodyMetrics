"use server";

import { revalidatePath } from "next/cache";
import { hasAiKey } from "@/lib/ai/client";
import { generateWeeklyReport, ReportError } from "@/lib/ai/report";
import { isDayKey, todayKey, weekStartKey } from "@/lib/dates";

export type ReportActionState = { ok?: boolean; error?: string } | null;

export async function createWeeklyReport(_prev: ReportActionState, formData: FormData): Promise<ReportActionState> {
  const weekStart = formData.get("weekStart");
  if (!isDayKey(weekStart) || weekStartKey(weekStart) !== weekStart) return { error: "Tuần không hợp lệ." };
  if (weekStart >= weekStartKey(todayKey())) return { error: "Chỉ tạo báo cáo cho tuần đã kết thúc." };
  if (!hasAiKey()) return { error: "Chưa cấu hình ANTHROPIC_API_KEY trong .env." };

  try {
    await generateWeeklyReport(weekStart);
  } catch (err) {
    if (err instanceof ReportError) return { error: err.message };
    console.error("Weekly report failed", err);
    return { error: "Không tạo được báo cáo. Xem log server để biết chi tiết." };
  }
  revalidatePath("/analytics");
  return { ok: true };
}
