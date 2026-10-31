"use client";

import { Loader2, Repeat } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { repeatMeal, repeatPreviousDay } from "@/app/(app)/meals/actions";
import { Button, cn } from "@/components/ui";

type Target = { mealId: string } | { date: string; type: string };

/** One tap to log the same food again: a meal ("Ăn lại") or the previous day's meal of a type. */
function useRepeat(target: Target) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // A ref, not only `disabled`: a double tap must not create two copies.
  const lock = useRef(false);
  const run = () => {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    start(async () => {
      try {
        const res = "mealId" in target ? await repeatMeal(target.mealId) : await repeatPreviousDay(target.date, target.type);
        // Success redirects; keep the lock until the page changes.
        if (res?.error) {
          setError(res.error);
          lock.current = false;
        }
      } catch {
        setError("Không lưu được. Thử lại sau.");
        lock.current = false;
      }
    });
  };
  return { pending, error, run };
}

/** "Ăn lại": copy this meal to today, now. */
export function RepeatMealButton({ mealId, compact }: { mealId: string; compact?: boolean }) {
  const { pending, error, run } = useRepeat({ mealId });
  const icon = pending ? <Loader2 className="size-4 animate-spin" /> : <Repeat className="size-4" />;
  if (compact) {
    return (
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title={error ?? "Ăn lại: thêm bữa giống hệt vào hôm nay"}
        aria-label="Ăn lại hôm nay"
        className={cn(
          "flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[11px] leading-none hover:bg-surface-2 hover:text-accent disabled:opacity-50",
          error ? "text-danger" : "text-muted",
        )}
      >
        {icon}
        Ăn lại
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" onClick={run} disabled={pending}>
        {icon} Ăn lại hôm nay
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/** "Lặp lại bữa … hôm qua" on the meal list: copies the previous day's meals of one type onto `date`. */
export function RepeatPreviousButton({ date, type, label, detail }: { date: string; type: string; label: string; detail: string }) {
  const { pending, error, run } = useRepeat({ date, type });
  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-accent/50 bg-accent/5 p-3 text-left text-sm hover:bg-accent/10 disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 shrink-0 animate-spin text-accent" /> : <Repeat className="size-4 shrink-0 text-accent" />}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-accent">{label}</span>
        <span className={cn("block truncate text-xs", error ? "text-danger" : "text-muted")}>{error ?? detail}</span>
      </span>
    </button>
  );
}
