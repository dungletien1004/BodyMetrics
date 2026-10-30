import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardTitle, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";
import { ProgressChart } from "@/components/workouts/progress-chart";
import { formatDayShort } from "@/lib/dates";
import { kcal, num } from "@/lib/format";
import { best1RM, bestSet, categoryLabel, epley1RM, setsSummary, setsVolume, type SetLike } from "@/lib/workouts";
import { getExerciseHistory } from "../../queries";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Session {
  workoutId: string;
  date: string;
  sets: SetLike[];
  minutes: number;
  distanceKm: number | null;
  kcal: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function ExerciseProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await getViewer();
  const { exercise, entries } = await getExerciseHistory(userId, id);
  if (!exercise) notFound();

  // One row per workout; the same exercise logged twice in a session is merged.
  const sessions: Session[] = [];
  for (const e of entries) {
    const last = sessions[sessions.length - 1];
    if (last?.workoutId === e.workout.id) {
      last.sets.push(...e.sets);
      last.minutes += e.durationMin;
      last.distanceKm = e.distanceKm != null ? (last.distanceKm ?? 0) + e.distanceKm : last.distanceKm;
      last.kcal += e.kcal;
    } else {
      sessions.push({ workoutId: e.workout.id, date: e.workout.date, sets: [...e.sets], minutes: e.durationMin, distanceKm: e.distanceKm, kcal: e.kcal });
    }
  }

  const weighted = sessions.filter((s) => bestSet(s.sets));
  const isLifting = weighted.length > 0;
  const allSets = sessions.flatMap((s) => s.sets.map((set) => ({ ...set, date: s.date })));

  const heaviest = bestSet(allSets);
  const top1RM = allSets.reduce<{ v: number; date: string } | null>((m, s) => {
    const v = epley1RM(s.weightKg ?? 0, s.reps ?? 0);
    return v > (m?.v ?? 0) ? { v, date: s.date } : m;
  }, null);
  const mostReps = allSets.reduce<(typeof allSets)[number] | null>((m, s) => {
    const reps = s.reps ?? 0;
    const best = m?.reps ?? 0;
    return reps > best || (reps === best && reps > 0 && (s.weightKg ?? 0) > (m?.weightKg ?? 0)) ? s : m;
  }, null);
  const topVolume = sessions.reduce<Session | null>((m, s) => (setsVolume(s.sets) > (m ? setsVolume(m.sets) : 0) ? s : m), null);
  const longest = sessions.reduce<Session | null>((m, s) => (s.minutes > (m?.minutes ?? 0) ? s : m), null);
  const farthest = sessions.reduce<Session | null>((m, s) => ((s.distanceKm ?? 0) > (m?.distanceKm ?? 0) ? s : m), null);

  const chartData = isLifting
    ? weighted.map((s) => ({ label: formatDayShort(s.date), best: bestSet(s.sets)!.weightKg, e1rm: round1(best1RM(s.sets)) }))
    : sessions.map((s) => ({ label: formatDayShort(s.date), minutes: round1(s.minutes), km: s.distanceKm }));

  return (
    <>
      <Link href="/workouts/exercises" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Thư viện bài tập
      </Link>
      <PageHeader
        title={exercise.name}
        subtitle={
          <span className="flex flex-wrap gap-1.5">
            <Badge>{categoryLabel(exercise.category)}</Badge>
            {exercise.muscleGroup && <Badge>{exercise.muscleGroup}</Badge>}
            <Badge>MET {num(exercise.met)}</Badge>
          </span>
        }
        action={
          <LinkButton href="/workouts/new" variant="secondary">
            <Plus className="size-4" /> Buổi tập
          </LinkButton>
        }
      />

      {sessions.length === 0 ? (
        <EmptyState title="Chưa có lần tập nào">Thêm bài này vào một buổi tập để theo dõi tiến độ.</EmptyState>
      ) : (
        <div className="space-y-4">
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {isLifting ? (
              <>
                <Stat label="Tạ nặng nhất" value={num(heaviest?.weightKg)} unit="kg" sub={heaviest && `${heaviest.reps} lần · ${formatDayShort(heaviest.date)}`} tone="accent" />
                <Stat label="1RM ước tính cao nhất" value={num(top1RM?.v)} unit="kg" sub={top1RM && formatDayShort(top1RM.date)} />
                <Stat label="Nhiều lần nhất / set" value={mostReps?.reps ?? "–"} unit="lần" sub={mostReps && `${num(mostReps.weightKg)} kg · ${formatDayShort(mostReps.date)}`} />
                <Stat label="Khối lượng buổi cao nhất" value={num(topVolume ? setsVolume(topVolume.sets) : null, 0)} unit="kg" sub={topVolume && formatDayShort(topVolume.date)} />
              </>
            ) : (
              <>
                <Stat label="Số buổi" value={sessions.length} />
                <Stat label="Lâu nhất" value={num(longest?.minutes, 0)} unit="phút" sub={longest && formatDayShort(longest.date)} tone="accent" />
                <Stat label="Xa nhất" value={num(farthest?.distanceKm)} unit="km" sub={farthest?.distanceKm ? formatDayShort(farthest.date) : undefined} />
                <Stat label="Tổng calo" value={kcal(sessions.reduce((a, s) => a + s.kcal, 0))} unit="kcal" tone="burn" />
              </>
            )}
          </Card>

          {chartData.length > 1 && (
            <Card>
              <CardTitle>{isLifting ? "Tạ nặng nhất & 1RM ước tính" : "Thời gian & quãng đường"}</CardTitle>
              <ProgressChart
                data={chartData}
                unit={isLifting ? "kg" : ""}
                series={
                  isLifting
                    ? [
                        { key: "best", label: "Set nặng nhất (kg)", color: "var(--accent)" },
                        { key: "e1rm", label: "1RM ước tính (kg)", color: "var(--burn)", dashed: true },
                      ]
                    : [
                        { key: "minutes", label: "Phút", color: "var(--accent)" },
                        { key: "km", label: "Km", color: "var(--burn)" },
                      ]
                }
              />
              {isLifting && <p className="mt-2 text-xs text-muted">1RM theo công thức Epley: kg × (1 + số lần / 30).</p>}
            </Card>
          )}

          <Card>
            <CardTitle>Lịch sử</CardTitle>
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr className="text-left">
                  <th className="py-1.5 pr-2 font-normal">Ngày</th>
                  {isLifting ? (
                    <>
                      <th className="py-1.5 pr-2 font-normal">Các set</th>
                      <th className="py-1.5 pr-2 text-right font-normal whitespace-nowrap">1RM</th>
                      <th className="py-1.5 text-right font-normal">KL (kg)</th>
                    </>
                  ) : (
                    <>
                      <th className="py-1.5 pr-2 text-right font-normal">Phút</th>
                      <th className="py-1.5 pr-2 text-right font-normal">Km</th>
                      <th className="py-1.5 text-right font-normal">kcal</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...sessions].reverse().map((s) => (
                  <tr key={s.workoutId}>
                    <td className="py-2 pr-2 align-top">
                      <Link href={`/workouts/${s.workoutId}`} className="text-accent hover:underline">
                        {formatDayShort(s.date)}
                      </Link>
                    </td>
                    {isLifting ? (
                      <>
                        <td className="py-2 pr-2">{setsSummary(s.sets) || "–"}</td>
                        <td className="py-2 pr-2 text-right">{best1RM(s.sets) ? num(best1RM(s.sets)) : "–"}</td>
                        <td className="py-2 text-right">{num(setsVolume(s.sets), 0)}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-2 text-right">{num(s.minutes, 0)}</td>
                        <td className="py-2 pr-2 text-right">{num(s.distanceKm)}</td>
                        <td className="py-2 text-right">{kcal(s.kcal)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
