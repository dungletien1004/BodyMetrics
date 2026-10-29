import "server-only";
import { adaptiveTdee, movingAverage, slope, weeksToGoal, type AdaptiveTdee } from "./calc";
import { formatDayLong, formatDayShort, shiftDay, todayKey, weekStartKey } from "./dates";
import { getDaySummaries, getProfile, type DaySummary } from "./summary";

export const RANGE_WEEKS = [4, 8, 12] as const;
export type RangeWeeks = (typeof RANGE_WEEKS)[number];

export function parseWeeks(v: string | string[] | undefined): RangeWeeks {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (RANGE_WEEKS as readonly number[]).includes(n) ? (n as RangeWeeks) : 8;
}

/** A day counts as logged when at least one meal was recorded. */
export const isLogged = (d: Pick<DaySummary, "mealsLogged">) => d.mealsLogged > 0;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface ChartDay {
  date: string;
  label: string; // dd/MM
  longLabel: string; // "Thứ Tư, 29/10"
  logged: boolean;
  weight: number | null; // logged weigh-in
  weightMa: number | null; // 7-day moving average of weigh-ins
  intake: number | null; // null when nothing was logged
  burn: number;
  target: number;
  balance: number | null; // null when not logged, and for today
  proteinG: number;
  carbG: number;
  fatG: number;
  proteinTargetG: number;
}

export interface WeekRow {
  weekStart: string;
  label: string; // dd/MM–dd/MM
  days: number; // days of the week that have happened (1..7)
  loggedDays: number;
  avgIntake: number | null;
  avgBurn: number | null;
  avgBalance: number | null;
  maChange: number | null; // kg, end-of-week MA vs previous end-of-week MA
  workouts: number;
}

export interface TdeeInsight {
  result: AdaptiveTdee;
  windowDays: number;
  formulaTdee: number; // avg baseline + logged exercise over the same window
}

export interface Analytics {
  weeks: RangeWeeks;
  from: string;
  to: string;
  goalWeightKg: number | null;
  days: ChartDay[];
  weekRows: WeekRow[];
  loggedDays: number; // complete days (before today) with meals logged
  avgBalance: number | null;
  proteinHitDays: number;
  avgMacros: { proteinG: number; carbG: number; fatG: number } | null;
  tdee: TdeeInsight | null;
  currentWeight: number | null; // latest 7-day MA
  trendKgPerWeek: number | null;
  goalDate: string | null;
  weeksToGoal: number | null;
  streak: number;
}

/** Consecutive logged days ending today (or yesterday, if today has nothing yet). */
function loggingStreak(days: DaySummary[]): number {
  let i = days.length - 1;
  if (i >= 0 && !isLogged(days[i])) i--;
  let n = 0;
  for (; i >= 0 && isLogged(days[i]); i--) n++;
  return n;
}

export async function getAnalytics(weeks: RangeWeeks): Promise<Analytics> {
  const today = todayKey();
  const from = shiftDay(weekStartKey(today), -7 * (weeks - 1));
  // Fetch extra history so the moving average, streak and adaptive TDEE have context.
  const lookback = Math.max(90, weeks * 7 + 35);
  const fetchFrom = shiftDay(today, -lookback);
  const [profile, all] = await Promise.all([getProfile(), getDaySummaries(fetchFrom < from ? fetchFrom : from, today)]);

  const ma = movingAverage(all.map((d) => d.loggedWeightKg));
  const startIdx = all.findIndex((d) => d.date === from);
  const inRange = all.slice(startIdx);
  const maInRange = ma.slice(startIdx);

  const days: ChartDay[] = inRange.map((d, i) => {
    const logged = isLogged(d);
    return {
      date: d.date,
      label: formatDayShort(d.date),
      longLabel: formatDayLong(d.date),
      logged,
      weight: d.loggedWeightKg,
      weightMa: maInRange[i],
      intake: logged ? d.intakeKcal : null,
      burn: d.totalBurn,
      target: d.targetKcal,
      balance: logged && d.date < today ? d.balance : null, // today's balance isn't final yet
      proteinG: d.proteinG,
      carbG: d.carbG,
      fatG: d.fatG,
      proteinTargetG: d.proteinTargetG,
    };
  });

  // Weekly rows, newest first. MA change compares the last MA value of each week.
  const maByDate = new Map(all.map((d, i) => [d.date, ma[i]]));
  const weekRows: WeekRow[] = [];
  // Averages skip today: it is still being logged and would drag the numbers down.
  for (let ws = from; ws <= today; ws = shiftDay(ws, 7)) {
    const we = shiftDay(ws, 6);
    const week = inRange.filter((d) => d.date >= ws && d.date <= we && d.date < today);
    const logged = week.filter(isLogged);
    const endMa = maByDate.get(we > today ? today : we) ?? null;
    const prevMa = maByDate.get(shiftDay(ws, -1)) ?? null;
    weekRows.push({
      weekStart: ws,
      label: `${formatDayShort(ws)}–${formatDayShort(we)}`,
      days: week.length,
      loggedDays: logged.length,
      avgIntake: avg(logged.map((d) => d.intakeKcal)),
      avgBurn: avg(logged.map((d) => d.totalBurn)),
      avgBalance: avg(logged.map((d) => d.balance)),
      maChange: endMa != null && prevMa != null ? Math.round((endMa - prevMa) * 10) / 10 : null,
      workouts: week.reduce((a, d) => a + d.workouts, 0),
    });
  }
  weekRows.reverse();

  const loggedInRange = inRange.filter((d) => isLogged(d) && d.date < today);
  const proteinHitDays = loggedInRange.filter((d) => d.proteinG >= d.proteinTargetG).length;
  const avgMacros = loggedInRange.length
    ? {
        proteinG: Math.round(avg(loggedInRange.map((d) => d.proteinG))!),
        carbG: Math.round(avg(loggedInRange.map((d) => d.carbG))!),
        fatG: Math.round(avg(loggedInRange.map((d) => d.fatG))!),
      }
    : null;

  // Adaptive TDEE over complete days only (today is still in progress): try 28 days, then 21, then 14.
  const complete = all.filter((d) => d.date < today);
  let tdee: TdeeInsight | null = null;
  for (const windowDays of [28, 21, 14]) {
    const win = complete.slice(-windowDays);
    const result = adaptiveTdee(win.map((d) => ({ intakeKcal: isLogged(d) ? d.intakeKcal : null, weightKg: d.loggedWeightKg })));
    if (result) {
      tdee = { result, windowDays, formulaTdee: Math.round(avg(win.map((d) => d.totalBurn))!) };
      break;
    }
  }

  // Weight trend: adaptive TDEE's slope if available, otherwise the last 28 days of weigh-ins.
  const recent = all.slice(-28).flatMap((d, i) => (d.loggedWeightKg != null ? [{ x: i, y: d.loggedWeightKg }] : []));
  const s = recent.length >= 5 ? slope(recent) : null;
  const trendKgPerWeek = tdee?.result.weightTrendKgPerWeek ?? (s != null ? Math.round(s * 7 * 100) / 100 : null);
  const currentWeight = [...ma].reverse().find((v) => v != null) ?? null;
  const goal = profile.goalWeightKg;
  const wtg = currentWeight != null && goal != null && trendKgPerWeek != null ? weeksToGoal(currentWeight, goal, trendKgPerWeek) : null;
  const goalDate = wtg != null ? shiftDay(today, wtg * 7) : null;

  return {
    weeks,
    from,
    to: today,
    goalWeightKg: goal,
    days,
    weekRows,
    loggedDays: loggedInRange.length,
    avgBalance: avg(loggedInRange.map((d) => d.balance)),
    proteinHitDays,
    avgMacros,
    tdee,
    currentWeight,
    trendKgPerWeek,
    goalDate,
    weeksToGoal: wtg,
    streak: loggingStreak(all),
  };
}
