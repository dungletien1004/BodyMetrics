import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { shiftDay, todayKey } from "./dates";

// Read-side helpers for the admin area: per-user activity numbers and the overview strip.

export interface UserStats {
  meals: number;
  workouts: number;
  bodyLogs: number;
  lastActivity: string | null; // latest meal/workout/body log day
  latestWeight: number | null;
  latestWeightDate: string | null;
  weightChange: number | null; // latest weight minus the weight `rangeDays` ago
}

export const WEIGHT_RANGES = [7, 30] as const;
export type WeightRange = (typeof WEIGHT_RANGES)[number];

export function parseRange(v: unknown): WeightRange {
  return v === "30" ? 30 : 7;
}

interface WeightRow {
  userId: string;
  date: string;
  weightKg: number;
}

/**
 * Stats for the given users. The weight change compares the latest log with the weight on the
 * day `rangeDays` ago (latest log on/before it, like getWeightOn), or with the first log inside
 * the window when there is none that old.
 */
export async function getUserStats(userIds: string[], rangeDays: WeightRange): Promise<Map<string, UserStats>> {
  const out = new Map<string, UserStats>();
  if (userIds.length === 0) return out;
  const cutoff = shiftDay(todayKey(), -rangeDays);
  const ids = Prisma.join(userIds);

  const [counts, mealMax, workoutMax, bodyMax, latest, atCutoff, firstInWindow] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, _count: { select: { meals: true, workouts: true, bodyLogs: true } } },
    }),
    db.meal.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { date: true } }),
    db.workout.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { date: true } }),
    db.bodyLog.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { date: true } }),
    db.$queryRaw<WeightRow[]>`
      SELECT DISTINCT ON ("userId") "userId", "date", "weightKg" FROM "BodyLog"
      WHERE "userId" IN (${ids}) AND "weightKg" IS NOT NULL
      ORDER BY "userId", "date" DESC, "createdAt" DESC`,
    db.$queryRaw<WeightRow[]>`
      SELECT DISTINCT ON ("userId") "userId", "date", "weightKg" FROM "BodyLog"
      WHERE "userId" IN (${ids}) AND "weightKg" IS NOT NULL AND "date" <= ${cutoff}
      ORDER BY "userId", "date" DESC, "createdAt" DESC`,
    db.$queryRaw<WeightRow[]>`
      SELECT DISTINCT ON ("userId") "userId", "date", "weightKg" FROM "BodyLog"
      WHERE "userId" IN (${ids}) AND "weightKg" IS NOT NULL AND "date" > ${cutoff}
      ORDER BY "userId", "date" ASC, "createdAt" ASC`,
  ]);

  const maxBy = (rows: { userId: string; _max: { date: string | null } }[]) => new Map(rows.map((r) => [r.userId, r._max.date]));
  const byUser = (rows: WeightRow[]) => new Map(rows.map((r) => [r.userId, r]));
  const [mealLast, workoutLast, bodyLast] = [maxBy(mealMax), maxBy(workoutMax), maxBy(bodyMax)];
  const [latestW, cutoffW, firstW] = [byUser(latest), byUser(atCutoff), byUser(firstInWindow)];

  for (const u of counts) {
    const days = [mealLast.get(u.id), workoutLast.get(u.id), bodyLast.get(u.id)].filter((d): d is string => !!d);
    const last = latestW.get(u.id);
    const base = cutoffW.get(u.id) ?? firstW.get(u.id);
    out.set(u.id, {
      meals: u._count.meals,
      workouts: u._count.workouts,
      bodyLogs: u._count.bodyLogs,
      lastActivity: days.length ? days.sort().at(-1)! : null,
      latestWeight: last?.weightKg ?? null,
      latestWeightDate: last?.date ?? null,
      weightChange: last && base && base.date < last.date ? Math.round((last.weightKg - base.weightKg) * 10) / 10 : null,
    });
  }
  return out;
}

export interface AdminOverview {
  users: number;
  activeUsers7d: number; // users with a meal, workout or body log in the last 7 days
  meals7d: number;
  workouts7d: number;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const since = shiftDay(todayKey(), -6);
  const recent = { date: { gte: since } };
  const [users, meals7d, workouts7d, mealUsers, workoutUsers, bodyUsers] = await Promise.all([
    db.user.count(),
    db.meal.count({ where: recent }),
    db.workout.count({ where: recent }),
    db.meal.findMany({ where: recent, distinct: ["userId"], select: { userId: true } }),
    db.workout.findMany({ where: recent, distinct: ["userId"], select: { userId: true } }),
    db.bodyLog.findMany({ where: recent, distinct: ["userId"], select: { userId: true } }),
  ]);
  const active = new Set([...mealUsers, ...workoutUsers, ...bodyUsers].map((r) => r.userId));
  return { users, activeUsers7d: active.size, meals7d, workouts7d };
}

/** Active admins other than `exceptId`; the last one can never be locked, demoted or deleted. */
export function countOtherActiveAdmins(exceptId: string, tx: Prisma.TransactionClient = db) {
  return tx.user.count({ where: { role: "admin", active: true, id: { not: exceptId } } });
}
