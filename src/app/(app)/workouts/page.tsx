import { BookOpen, ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import Link from "next/link";
import { Card, cn, LinkButton, PageHeader, Stat } from "@/components/ui";
import { DeleteWorkoutButton } from "@/components/workouts/delete-workout-button";
import { dayRange, formatDayLong, formatDayShort, isDayKey, shiftDay, todayKey, weekStartKey } from "@/lib/dates";
import { kcal, num } from "@/lib/format";
import { setsSummary, setsVolume, timeOfDay, workoutKcal } from "@/lib/workouts";
import { getWorkoutsBetween } from "./queries";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const today = todayKey();
  const week = weekStartKey(isDayKey(sp.week) ? sp.week : today);
  const end = shiftDay(week, 6);
  const thisWeek = weekStartKey(today);
  const { userId } = await getViewer();
  const workouts = await getWorkoutsBetween(userId, week, end);

  const entries = workouts.flatMap((w) => w.entries);
  const totals = {
    sessions: workouts.length,
    minutes: Math.round(entries.reduce((a, e) => a + e.durationMin, 0)),
    kcal: workouts.reduce((a, w) => a + workoutKcal(w), 0),
    volume: entries.reduce((a, e) => a + setsVolume(e.sets), 0),
  };

  return (
    <>
      <PageHeader
        title="Tập luyện"
        subtitle="Nhật ký buổi tập theo tuần"
        action={
          <div className="flex gap-2">
            <LinkButton href="/workouts/exercises" variant="secondary">
              <BookOpen className="size-4" /> Bài tập
            </LinkButton>
            <LinkButton href={`/workouts/new${week === thisWeek ? "" : `?date=${week}`}`}>
              <Plus className="size-4" /> Buổi tập
            </LinkButton>
          </div>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/workouts?week=${shiftDay(week, -7)}`} aria-label="Tuần trước" className="rounded-xl p-2 text-muted hover:bg-surface-2">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="text-center">
          <div className="font-medium">
            {formatDayShort(week)} – {formatDayShort(end)}
          </div>
          {week === thisWeek ? (
            <div className="text-xs text-muted">Tuần này</div>
          ) : (
            <Link href="/workouts" className="text-xs text-accent">
              Về tuần này
            </Link>
          )}
        </div>
        <Link href={`/workouts?week=${shiftDay(week, 7)}`} aria-label="Tuần sau" className="rounded-xl p-2 text-muted hover:bg-surface-2">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <Card className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Buổi tập" value={totals.sessions} />
        <Stat label="Phút tập" value={num(totals.minutes, 0)} unit="phút" />
        <Stat label="Calo tiêu hao" value={kcal(totals.kcal)} unit="kcal" tone="burn" />
        <Stat label="Khối lượng tạ" value={num(totals.volume, 0)} unit="kg" sub="Tổng số lần × kg" />
      </Card>

      <div className="space-y-3">
        {dayRange(week, end).map((day) => {
          const list = workouts.filter((w) => w.date === day);
          const heading = (
            <h2 className={cn("text-sm font-semibold", day === today && "text-accent")}>
              {formatDayLong(day)}
              {day === today && " · Hôm nay"}
            </h2>
          );
          const add = (
            <Link href={`/workouts/new?date=${day}`} aria-label={`Thêm buổi tập ${formatDayShort(day)}`} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent">
              <Plus className="size-4" />
            </Link>
          );
          if (!list.length) {
            return (
              <section key={day} className="flex items-center justify-between gap-2 rounded-2xl border border-dashed border-border py-1 pr-1.5 pl-4">
                <div className="flex items-baseline gap-2">
                  {heading}
                  <span className="text-xs text-muted">Nghỉ</span>
                </div>
                {add}
              </section>
            );
          }
          return (
            <section key={day}>
              <div className="mb-1.5 flex items-center justify-between pl-1">
                {heading}
                {add}
              </div>
              <div className="space-y-2">
                {list.map((w) => (
                  <Card key={w.id} className="flex items-start gap-2">
                    <Link href={`/workouts/${w.id}`} className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="flex items-center gap-1.5 text-sm text-muted">
                          <Clock className="size-3.5" /> {timeOfDay(w.startedAt)} · {w.durationMin} phút
                        </span>
                        <span className="font-semibold tabular-nums text-burn">
                          {kcal(workoutKcal(w))} kcal{w.kcalOverride != null && <span className="ml-1 text-xs font-normal text-muted">(đồng hồ)</span>}
                        </span>
                      </div>
                      <ul className="mt-1.5 space-y-0.5 text-sm">
                        {w.entries.map((e) => (
                          <li key={e.id} className="sm:flex sm:justify-between sm:gap-3">
                            <span className="block min-w-0 truncate">{e.exercise.name}</span>
                            <span className="block text-xs text-muted tabular-nums sm:shrink-0 sm:text-sm">
                              {e.sets.length ? setsSummary(e.sets) : `${num(e.durationMin, 0)} phút${e.distanceKm ? ` · ${num(e.distanceKm)} km` : ""}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {w.note && <p className="mt-1.5 line-clamp-1 text-xs text-muted">{w.note}</p>}
                    </Link>
                    <DeleteWorkoutButton id={w.id} compact />
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
