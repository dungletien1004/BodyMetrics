import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { WorkoutBuilder } from "@/components/workouts/workout-builder";
import { hasAiKey } from "@/lib/ai/client";
import { formatDayLong } from "@/lib/dates";
import { getWeightOn } from "@/lib/summary";
import { payloadFromWorkout } from "@/lib/workouts";
import { getExerciseHabits, getExerciseOptions, getWorkout } from "../../queries";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function EditWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await getViewer();
  const workout = await getWorkout(userId, id);
  if (!workout) notFound();

  const [exercises, habits, weight] = await Promise.all([
    getExerciseOptions(userId),
    getExerciseHabits(userId),
    getWeightOn(userId, workout.date),
  ]);

  return (
    <>
      <PageHeader title="Sửa buổi tập" subtitle={formatDayLong(workout.date)} />
      <WorkoutBuilder
        exercises={exercises}
        habits={habits}
        initial={payloadFromWorkout(workout)}
        initialWeightKg={weight}
        workoutId={workout.id}
        aiEnabled={hasAiKey()}
      />
    </>
  );
}
