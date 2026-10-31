import { PageHeader } from "@/components/ui";
import { WorkoutBuilder } from "@/components/workouts/workout-builder";
import { isDayKey, todayKey } from "@/lib/dates";
import { getWeightOn } from "@/lib/summary";
import { payloadFromWorkout, timeOfDay, type WorkoutPayload } from "@/lib/workouts";
import { getExerciseHabits, getExerciseOptions, getWorkout } from "../queries";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function NewWorkoutPage({ searchParams }: { searchParams: Promise<{ date?: string; from?: string }> }) {
  const sp = await searchParams;
  const date = isDayKey(sp.date) ? sp.date : todayKey();
  const startTime = timeOfDay(new Date());

  // "Lặp lại buổi này": copy exercises, sets and settings onto the chosen day (today by default).
  const { userId } = await getViewer();
  const source = sp.from ? await getWorkout(userId, sp.from) : null;
  const initial: WorkoutPayload = source
    ? payloadFromWorkout(source, { date, startTime, kcalOverride: null, note: "" }) // watch reading and note belong to the original
    : { date, startTime, durationMin: null, kcalOverride: null, note: "", entries: [] };

  const [exercises, habits, weight] = await Promise.all([
    getExerciseOptions(userId),
    getExerciseHabits(userId),
    getWeightOn(userId, date),
  ]);

  return (
    <>
      <PageHeader
        title={source ? "Lặp lại buổi tập" : "Buổi tập mới"}
        subtitle={source ? "Đã điền sẵn từ buổi trước - chỉnh số set, tạ rồi lưu." : "Chọn bài tập rồi nhập set hoặc số phút."}
      />
      <WorkoutBuilder exercises={exercises} habits={habits} initial={initial} initialWeightKg={weight} />
    </>
  );
}
