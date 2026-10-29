import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { WorkoutBuilder } from "@/components/workouts/workout-builder";
import { formatDayLong } from "@/lib/dates";
import { getWeightOn } from "@/lib/summary";
import { payloadFromWorkout } from "@/lib/workouts";
import { getExerciseOptions, getWorkout } from "../../queries";

export const dynamic = "force-dynamic";

export default async function EditWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workout = await getWorkout(id);
  if (!workout) notFound();

  const [exercises, weight] = await Promise.all([getExerciseOptions(), getWeightOn(workout.date)]);

  return (
    <>
      <PageHeader title="Sửa buổi tập" subtitle={formatDayLong(workout.date)} />
      <WorkoutBuilder exercises={exercises} initial={payloadFromWorkout(workout)} initialWeightKg={weight} workoutId={workout.id} />
    </>
  );
}
