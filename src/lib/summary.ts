import "server-only";
import { db } from "./db";
import { baselineTdee, bmr, intakeTarget, proteinTarget, type EnergyProfile } from "./calc";
import { dayRange } from "./dates";

export async function getProfile() {
  return db.profile.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

/** Most recent weight on or before `day`, falling back to the profile's start weight, then 70 kg. */
export async function getWeightOn(day: string): Promise<number> {
  const log = await db.bodyLog.findFirst({
    where: { date: { lte: day }, weightKg: { not: null } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  if (log?.weightKg) return log.weightKg;
  const profile = await getProfile();
  return profile.startWeightKg ?? 70;
}

export interface DaySummary {
  date: string;
  weightKg: number; // weight used for the calculations
  loggedWeightKg: number | null; // weight actually logged that day
  intakeKcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  mealsLogged: number;
  exerciseKcal: number;
  workouts: number;
  bmr: number;
  baselineTdee: number;
  totalBurn: number; // baseline + exercise
  targetKcal: number;
  proteinTargetG: number;
  balance: number; // intake - totalBurn (negative = deficit)
}

/** Per-day totals for an inclusive range of day keys, oldest first. */
export async function getDaySummaries(from: string, to: string): Promise<DaySummary[]> {
  const profile: EnergyProfile = await getProfile();
  const [items, meals, workouts, bodyLogs, priorLog] = await Promise.all([
    db.mealItem.findMany({
      where: { meal: { date: { gte: from, lte: to } } },
      select: { kcal: true, proteinG: true, carbG: true, fatG: true, meal: { select: { date: true } } },
    }),
    db.meal.groupBy({ by: ["date"], where: { date: { gte: from, lte: to } }, _count: true }),
    db.workout.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true, kcalOverride: true, entries: { select: { kcal: true } } },
    }),
    db.bodyLog.findMany({
      where: { date: { gte: from, lte: to }, weightKg: { not: null } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { date: true, weightKg: true },
    }),
    db.bodyLog.findFirst({
      where: { date: { lt: from }, weightKg: { not: null } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { weightKg: true },
    }),
  ]);

  const fallbackWeight = priorLog?.weightKg ?? bodyLogs[0]?.weightKg ?? (await getProfile()).startWeightKg ?? 70;
  const weightByDay = new Map<string, number>();
  for (const l of bodyLogs) weightByDay.set(l.date, l.weightKg!); // last log of the day wins

  let carriedWeight = fallbackWeight;
  return dayRange(from, to).map((date) => {
    const logged = weightByDay.get(date) ?? null;
    if (logged != null) carriedWeight = logged;
    const w = carriedWeight;

    const dayItems = items.filter((i) => i.meal.date === date);
    const sum = (k: "kcal" | "proteinG" | "carbG" | "fatG") => Math.round(dayItems.reduce((a, i) => a + i[k], 0));
    const exercise = Math.round(
      workouts
        .filter((wk) => wk.date === date)
        .reduce((a, wk) => a + (wk.kcalOverride ?? wk.entries.reduce((s, e) => s + e.kcal, 0)), 0),
    );
    const base = baselineTdee(profile, w);
    const intake = sum("kcal");

    return {
      date,
      weightKg: w,
      loggedWeightKg: logged,
      intakeKcal: intake,
      proteinG: sum("proteinG"),
      carbG: sum("carbG"),
      fatG: sum("fatG"),
      mealsLogged: meals.find((m) => m.date === date)?._count ?? 0,
      exerciseKcal: exercise,
      workouts: workouts.filter((wk) => wk.date === date).length,
      bmr: bmr(profile, w),
      baselineTdee: base,
      totalBurn: base + exercise,
      targetKcal: intakeTarget(profile, w, exercise),
      proteinTargetG: proteinTarget(profile, w),
      balance: intake - (base + exercise),
    };
  });
}

export async function getDaySummary(date: string): Promise<DaySummary> {
  return (await getDaySummaries(date, date))[0];
}
