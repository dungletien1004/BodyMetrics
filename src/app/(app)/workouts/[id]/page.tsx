import { ArrowLeft, Pencil, Repeat } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, LinkButton, PageHeader, Stat } from "@/components/ui";
import { DeleteWorkoutButton } from "@/components/workouts/delete-workout-button";
import { INTENSITY_LABEL } from "@/lib/calc";
import { formatDayLong, formatDayShort, weekStartKey } from "@/lib/dates";
import { kcal, num } from "@/lib/format";
import { categoryLabel, epley1RM, isIntensity, setsVolume, timeOfDay, workoutKcal } from "@/lib/workouts";
import { getWorkout } from "../queries";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await getViewer();
  const w = await getWorkout(userId, id);
  if (!w) notFound();

  const estimate = w.entries.reduce((a, e) => a + e.kcal, 0);
  const volume = w.entries.reduce((a, e) => a + setsVolume(e.sets), 0);
  const weekHref = `/workouts?week=${weekStartKey(w.date)}`;

  return (
    <>
      <Link href={weekHref} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Tuần {formatDayShort(weekStartKey(w.date))}
      </Link>
      <PageHeader
        title={formatDayLong(w.date)}
        subtitle={`Bắt đầu ${timeOfDay(w.startedAt)} · ${w.entries.length} bài tập`}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/workouts/new?from=${w.id}`}>
              <Repeat className="size-4" /> Lặp lại buổi này
            </LinkButton>
            <LinkButton href={`/workouts/${w.id}/edit`} variant="secondary">
              <Pencil className="size-4" /> Sửa
            </LinkButton>
            <DeleteWorkoutButton id={w.id} redirectTo={weekHref} />
          </div>
        }
      />

      <Card className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Thời gian" value={w.durationMin} unit="phút" />
        <Stat
          label="Calo tiêu hao"
          value={kcal(workoutKcal(w))}
          unit="kcal"
          tone="burn"
          sub={w.kcalOverride != null ? `Từ đồng hồ · ước tính MET ${kcal(estimate)}` : "Ước tính theo MET"}
        />
        <Stat label="Khối lượng tạ" value={num(volume, 0)} unit="kg" />
        <Stat label="Phút tập thực tế" value={num(w.entries.reduce((a, e) => a + e.durationMin, 0), 0)} unit="phút" />
      </Card>

      {w.note && (
        <Card className="mb-4 text-sm whitespace-pre-line">
          <span className="text-muted">Ghi chú: </span>
          {w.note}
        </Card>
      )}

      <div className="space-y-3">
        {w.entries.map((e, i) => (
          <Card key={e.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/workouts/exercises/${e.exerciseId}`} className="font-medium hover:text-accent">
                  <span className="mr-1.5 text-muted">{i + 1}.</span>
                  {e.exercise.name}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge>{categoryLabel(e.exercise.category)}</Badge>
                  {e.exercise.muscleGroup && <Badge>{e.exercise.muscleGroup}</Badge>}
                  <Badge>{isIntensity(e.intensity) ? INTENSITY_LABEL[e.intensity] : e.intensity}</Badge>
                  <Badge>{num(e.durationMin)} phút</Badge>
                  {e.distanceKm != null && <Badge>{num(e.distanceKm)} km</Badge>}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-burn">{kcal(e.kcal)} kcal</span>
            </div>
            {e.sets.length > 0 && (
              <table className="mt-3 w-full text-sm tabular-nums">
                <thead className="text-xs text-muted">
                  <tr className="text-left">
                    <th className="py-1 font-normal">Set</th>
                    <th className="py-1 font-normal">Số lần</th>
                    <th className="py-1 font-normal">Tạ</th>
                    <th className="py-1 text-right font-normal">1RM ước tính</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {e.sets.map((s) => (
                    <tr key={s.id}>
                      <td className="py-1.5 text-muted">{s.setNo}</td>
                      <td className="py-1.5">{s.reps ?? "–"}</td>
                      <td className="py-1.5">{s.weightKg != null ? `${num(s.weightKg)} kg` : "–"}</td>
                      <td className="py-1.5 text-right text-muted">
                        {s.weightKg && s.reps ? `${num(epley1RM(s.weightKg, s.reps))} kg` : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
