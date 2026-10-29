import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { movingAverage } from "../calc";
import { db } from "../db";
import { shiftDay } from "../dates";
import { getDaySummaries, getProfile } from "../summary";
import { AI_MODEL, anthropic } from "./client";

// ---------------------------------------------------------------------------
// Report shape (what Claude returns, stored as JSON in WeeklyReport.content)
// ---------------------------------------------------------------------------

export const ReportSchema = z.object({
  summary: z.string().describe("2-4 câu tóm tắt tuần, giọng động viên, có số liệu cụ thể"),
  wins: z.array(z.string()).describe("Điểm làm tốt trong tuần, mỗi ý một câu, dựa trên số liệu"),
  issues: z.array(z.string()).describe("Điểm cần cải thiện, nói thẳng nhưng tích cực"),
  recommendations: z
    .array(z.object({ title: z.string(), detail: z.string() }))
    .describe("2-4 hành động cụ thể cho tuần tới"),
  nextWeekTargets: z.object({
    kcal: z.number().describe("Mục tiêu calo nạp trung bình mỗi ngày"),
    proteinG: z.number().describe("Mục tiêu protein mỗi ngày (g)"),
    workouts: z.number().describe("Số buổi tập trong tuần"),
  }),
});
export type WeeklyReportContent = z.infer<typeof ReportSchema>;

/** Parse a stored report; null if it isn't the structured JSON shape. */
export function parseReportContent(content: string): WeeklyReportContent | null {
  try {
    const r = ReportSchema.safeParse(JSON.parse(content));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stats snapshot for one Mon-Sun week
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const LATE_HOUR = 21;

export async function buildWeekStats(weekStart: string) {
  const weekEnd = shiftDay(weekStart, 6);
  const [profile, history, workouts, meals] = await Promise.all([
    getProfile(),
    // Two prior weeks give the moving average and a comparison week.
    getDaySummaries(shiftDay(weekStart, -14), weekEnd),
    db.workout.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      orderBy: { date: "asc" },
      include: { entries: { orderBy: { order: "asc" }, include: { exercise: true, sets: true } } },
    }),
    db.meal.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      orderBy: { eatenAt: "asc" },
      include: { items: true },
    }),
  ]);

  const ma = movingAverage(history.map((d) => d.loggedWeightKg));
  const maOn = (day: string) => ma[history.findIndex((d) => d.date === day)] ?? null;
  const week = history.filter((d) => d.date >= weekStart);
  const prevWeek = history.filter((d) => d.date >= shiftDay(weekStart, -7) && d.date < weekStart);
  const logged = week.filter((d) => d.mealsLogged > 0);
  const prevLogged = prevWeek.filter((d) => d.mealsLogged > 0);

  // Workouts: per session and per exercise volume.
  const sessions = workouts.map((w) => ({
    date: w.date,
    durationMin: w.durationMin,
    kcal: Math.round(w.kcalOverride ?? w.entries.reduce((a, e) => a + e.kcal, 0)),
    exercises: w.entries.map((e) => {
      const volumeKg = e.sets.reduce((a, s) => a + (s.reps ?? 0) * (s.weightKg ?? 0), 0);
      return {
        name: e.exercise.name,
        category: e.exercise.category,
        minutes: e.durationMin,
        sets: e.sets.length || undefined,
        topSetKg: e.sets.length ? Math.max(...e.sets.map((s) => s.weightKg ?? 0)) || undefined : undefined,
        volumeKg: volumeKg || undefined,
        distanceKm: e.distanceKm ?? undefined,
      };
    }),
  }));
  const allEntries = sessions.flatMap((s) => s.exercises);

  // Meals: top foods, late-night eating, timing.
  const foods = new Map<string, { times: number; kcal: number }>();
  for (const m of meals)
    for (const it of m.items) {
      const f = foods.get(it.name) ?? { times: 0, kcal: 0 };
      f.times++;
      f.kcal += it.kcal;
      foods.set(it.name, f);
    }
  const topFoods = [...foods.entries()]
    .map(([name, f]) => ({ name, times: f.times, totalKcal: Math.round(f.kcal) }))
    .sort((a, b) => b.totalKcal - a.totalKcal)
    .slice(0, 8);
  const mealKcal = (m: (typeof meals)[number]) => Math.round(m.items.reduce((a, i) => a + i.kcal, 0));
  const lateMeals = meals.filter((m) => m.eatenAt.getHours() >= LATE_HOUR);
  const totalKcal = meals.reduce((a, m) => a + mealKcal(m), 0);

  return {
    week: { start: weekStart, end: weekEnd },
    profile: {
      sex: profile.sex,
      heightCm: profile.heightCm,
      goalWeightKg: profile.goalWeightKg,
      plannedDailyDeficit: profile.dailyDeficit,
      proteinPerKg: profile.proteinPerKg,
    },
    weight: {
      weighIns: week.filter((d) => d.loggedWeightKg != null).map((d) => ({ date: d.date, kg: d.loggedWeightKg })),
      movingAvgStart: maOn(shiftDay(weekStart, -1)),
      movingAvgEnd: maOn(weekEnd),
      changeKg: (() => {
        const a = maOn(shiftDay(weekStart, -1));
        const b = maOn(weekEnd);
        return a != null && b != null ? round1(b - a) : null;
      })(),
    },
    energy: {
      daysLogged: logged.length,
      avgIntakeKcal: avg(logged.map((d) => d.intakeKcal)),
      avgTargetKcal: avg(week.map((d) => d.targetKcal)),
      avgTotalBurnKcal: avg(week.map((d) => d.totalBurn)),
      avgBalanceKcal: avg(logged.map((d) => d.balance)),
      daysOverTarget: logged.filter((d) => d.intakeKcal > d.targetKcal + 100).length,
      prevWeekAvgIntakeKcal: avg(prevLogged.map((d) => d.intakeKcal)),
      prevWeekDaysLogged: prevLogged.length,
    },
    protein: {
      avgG: avg(logged.map((d) => d.proteinG)),
      targetG: week.at(-1)?.proteinTargetG ?? null,
      daysHit: logged.filter((d) => d.proteinG >= d.proteinTargetG).length,
    },
    macrosAvgG: { protein: avg(logged.map((d) => d.proteinG)), carb: avg(logged.map((d) => d.carbG)), fat: avg(logged.map((d) => d.fatG)) },
    days: week.map((d) => ({
      date: d.date,
      meals: d.mealsLogged,
      intakeKcal: d.mealsLogged ? d.intakeKcal : null,
      targetKcal: d.targetKcal,
      proteinG: d.mealsLogged ? d.proteinG : null,
      exerciseKcal: d.exerciseKcal,
      workouts: d.workouts,
    })),
    workouts: {
      count: sessions.length,
      totalMinutes: sessions.reduce((a, s) => a + s.durationMin, 0),
      totalKcal: sessions.reduce((a, s) => a + s.kcal, 0),
      strengthVolumeKg: Math.round(allEntries.reduce((a, e) => a + (e.volumeKg ?? 0), 0)),
      cardioMinutes: allEntries.filter((e) => e.category === "cardio").reduce((a, e) => a + e.minutes, 0),
      sessions,
    },
    meals: {
      count: meals.length,
      topFoods,
      lateNight: {
        afterHour: LATE_HOUR,
        count: lateMeals.length,
        kcal: lateMeals.reduce((a, m) => a + mealKcal(m), 0),
        sharePct: totalKcal ? Math.round((lateMeals.reduce((a, m) => a + mealKcal(m), 0) / totalKcal) * 100) : 0,
      },
    },
    gaps: {
      daysWithoutMeals: week.filter((d) => d.mealsLogged === 0).map((d) => d.date),
      daysWithoutWeighIn: week.filter((d) => d.loggedWeightKg == null).map((d) => d.date),
    },
  };
}
export type WeekStats = Awaited<ReturnType<typeof buildWeekStats>>;

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

const SYSTEM = `Bạn là huấn luyện viên dinh dưỡng và thể hình, viết báo cáo tuần cho một người đang giảm cân bằng ứng dụng BodyMetrics.

Dữ liệu là bản tóm tắt JSON của một tuần (thứ Hai đến Chủ nhật): cân nặng (trung bình động 7 ngày), calo nạp so với mục tiêu và tổng tiêu hao ước tính, protein, buổi tập, món ăn hay ăn, ăn khuya và những ngày quên ghi.

Cách viết:
- Toàn bộ bằng tiếng Việt, giọng thân thiện, động viên, xưng "bạn".
- Cụ thể: nhắc tới số liệu, ngày, món ăn hoặc bài tập có trong dữ liệu. Không bịa thông tin không có trong dữ liệu.
- Cân nặng dao động hằng ngày do nước; đánh giá xu hướng bằng trung bình động, không phải một lần cân.
- Nếu dữ liệu ít (nhiều ngày không ghi), nói rõ điều đó và ưu tiên khuyến nghị ghi chép đều hơn.
- Khuyến nghị phải thực tế, làm được ngay tuần tới, phù hợp món ăn Việt Nam.
- Mục tiêu tuần tới: calo nạp trung bình/ngày gần với mục tiêu trong dữ liệu (chỉ điều chỉnh khi có lý do), protein theo mục tiêu, số buổi tập khả thi.
- Không chẩn đoán hay đưa ra lời khuyên y khoa, không khuyên thuốc hay thực phẩm chức năng, không đề xuất mức calo dưới năng lượng nền. Nếu có dấu hiệu bất thường (giảm quá nhanh, ăn quá ít), nhẹ nhàng gợi ý hỏi ý kiến chuyên gia.`;

export class ReportError extends Error {}

export async function generateWeeklyReport(weekStart: string) {
  const stats = await buildWeekStats(weekStart);
  if (stats.energy.daysLogged === 0 && stats.weight.weighIns.length === 0 && stats.workouts.count === 0) {
    throw new ReportError("Tuần này chưa có dữ liệu nào để viết báo cáo.");
  }

  let content: WeeklyReportContent;
  try {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Số liệu tuần ${weekStart} → ${stats.week.end}:\n\n${JSON.stringify(stats, null, 2)}` }],
    });
    if (response.stop_reason === "refusal") throw new ReportError("AI từ chối viết báo cáo cho dữ liệu này. Thử lại sau nhé.");
    if (response.stop_reason === "max_tokens") throw new ReportError("Báo cáo bị cắt ngang do quá dài. Thử tạo lại.");
    if (!response.parsed_output) throw new ReportError("AI trả về dữ liệu không đúng định dạng. Thử tạo lại.");
    content = response.parsed_output;
  } catch (err) {
    if (err instanceof ReportError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new ReportError("ANTHROPIC_API_KEY không hợp lệ.");
    if (err instanceof Anthropic.RateLimitError) throw new ReportError("AI đang bị giới hạn tần suất. Đợi một chút rồi thử lại.");
    if (err instanceof Anthropic.APIConnectionError) throw new ReportError("Không kết nối được tới AI. Kiểm tra mạng rồi thử lại.");
    if (err instanceof Anthropic.APIError) throw new ReportError(`Lỗi từ AI (${err.status ?? "?"}): ${err.message}`);
    throw err;
  }

  return db.weeklyReport.upsert({
    where: { weekStart },
    update: { stats: JSON.stringify(stats), content: JSON.stringify(content), createdAt: new Date() },
    create: { weekStart, stats: JSON.stringify(stats), content: JSON.stringify(content) },
  });
}
