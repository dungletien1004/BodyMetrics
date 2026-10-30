import "server-only";
import { movingAverage } from "./calc";
import { db } from "./db";
import { dayRange, formatDayShort, shiftDay, todayKey } from "./dates";

export interface WeightSeries {
  points: { date: string; label: string; weight: number | null; avg: number | null }[];
  latest: number | null; // latest logged weight
  latestAvg: number | null; // 7-day average today
  weekChange: number | null; // 7-day average vs a week earlier
  firstWeight: number | null; // first weight ever logged
}

/** Daily weight (last log per day) with a trailing 7-day average, for the last `days` days. */
export async function getWeightSeries(userId: string, days: number): Promise<WeightSeries> {
  const to = todayKey();
  const from = shiftDay(to, -(days - 1));
  // Load 7 extra days so the average is warm at the start of the window.
  const warmFrom = shiftDay(from, -7);
  const [logs, first] = await Promise.all([
    db.bodyLog.findMany({
      where: { userId, date: { gte: warmFrom, lte: to }, weightKg: { not: null } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { date: true, weightKg: true },
    }),
    db.bodyLog.findFirst({
      where: { userId, weightKg: { not: null } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { weightKg: true },
    }),
  ]);

  const byDay = new Map(logs.map((l) => [l.date, l.weightKg!]));
  const keys = dayRange(warmFrom, to);
  const raw = keys.map((k) => byDay.get(k) ?? null);
  const avg = movingAverage(raw, 7);
  const offset = keys.indexOf(from);

  const points = keys.slice(offset).map((date, i) => ({
    date,
    label: formatDayShort(date),
    weight: raw[offset + i],
    avg: avg[offset + i],
  }));

  const latestAvg = avg.at(-1) ?? null;
  const weekAgoAvg = avg.at(-8) ?? null;
  return {
    points,
    latest: logs.at(-1)?.weightKg ?? null,
    latestAvg,
    weekChange: latestAvg != null && weekAgoAvg != null ? Math.round((latestAvg - weekAgoAvg) * 10) / 10 : null,
    firstWeight: first?.weightKg ?? null,
  };
}
