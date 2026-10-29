import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { vi } from "date-fns/locale";

// A "day key" is the local calendar date as YYYY-MM-DD. The app runs on the user's
// own machine, so server local time is the user's local time.
export function dayKey(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

export function todayKey(): string {
  return dayKey(new Date());
}

export function parseDay(key: string): Date {
  return parseISO(key);
}

export function shiftDay(key: string, days: number): string {
  return dayKey(addDays(parseDay(key), days));
}

/** Inclusive list of day keys from `from` to `to`. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = shiftDay(k, 1)) out.push(k);
  return out;
}

/** Monday of the week containing `key`. */
export function weekStartKey(key: string): string {
  return dayKey(startOfWeek(parseDay(key), { weekStartsOn: 1 }));
}

export function isDayKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** "Thứ Tư, 29/10" */
export function formatDayLong(key: string): string {
  const s = format(parseDay(key), "EEEE, dd/MM", { locale: vi });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "29/10" */
export function formatDayShort(key: string): string {
  return format(parseDay(key), "dd/MM");
}
