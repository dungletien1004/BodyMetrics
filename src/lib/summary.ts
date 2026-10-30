import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { baselineTdee, bmr, intakeTarget, proteinTarget, type EnergyProfile } from "./calc";
import { dayRange } from "./dates";

// Every function here takes the id of the user whose data to read (see getViewer in lib/auth).

/**
 * The user's profile, created with defaults on first use. Pages call this several times in
 * parallel, so two first calls can race to create it; the loser just reads the winner's row.
 */
export async function getProfile(userId: string) {
  const existing = await db.profile.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await db.profile.create({ data: { userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return db.profile.findUniqueOrThrow({ where: { userId } });
    }
    throw err;
  }
}

/** Most recent weight on or before `day`, falling back to the profile's start weight, then 70 kg. */
export async function getWeightOn(userId: string, day: string): Promise<number> {
  const log = await db.bodyLog.findFirst({
    where: { userId, date: { lte: day }, weightKg: { not: null } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  if (log?.weightKg) return log.weightKg;
  const profile = await getProfile(userId);
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
export async function getDaySummaries(userId: string, from: string, to: string): Promise<DaySummary[]> {
  const profile: EnergyProfile & { startWeightKg: number | null } = await getProfile(userId);
  const [items, meals, workouts, bodyLogs, priorLog] = await Promise.all([
    db.mealItem.findMany({
      where: { meal: { userId, date: { gte: from, lte: to } } },
      select: { kcal: true, proteinG: true, carbG: true, fatG: true, meal: { select: { date: true } } },
    }),
    db.meal.groupBy({ by: ["date"], where: { userId, date: { gte: from, lte: to } }, _count: true }),
    db.workout.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { date: true, kcalOverride: true, entries: { select: { kcal: true } } },
    }),
    db.bodyLog.findMany({
      where: { userId, date: { gte: from, lte: to }, weightKg: { not: null } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { date: true, weightKg: true },
    }),
    db.bodyLog.findFirst({
      where: { userId, date: { lt: from }, weightKg: { not: null } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { weightKg: true },
    }),
  ]);

  const fallbackWeight = priorLog?.weightKg ?? bodyLogs[0]?.weightKg ?? profile.startWeightKg ?? 70;
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

export async function getDaySummary(userId: string, date: string): Promise<DaySummary> {
  return (await getDaySummaries(userId, date, date))[0];
}
