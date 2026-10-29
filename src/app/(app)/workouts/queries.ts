import "server-only";
import { db } from "@/lib/db";
import { compareExercises } from "@/lib/workouts";

const entryInclude = {
  orderBy: { order: "asc" },
  include: { exercise: true, sets: { orderBy: { setNo: "asc" } } },
} as const;

export async function getWorkoutsBetween(from: string, to: string) {
  return db.workout.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: [{ date: "asc" }, { startedAt: "asc" }],
    include: { entries: entryInclude },
  });
}

export async function getWorkout(id: string) {
  return db.workout.findUnique({ where: { id }, include: { entries: entryInclude } });
}

export type WorkoutWithEntries = NonNullable<Awaited<ReturnType<typeof getWorkout>>>;

export async function listExercises() {
  const list = await db.exercise.findMany({ include: { _count: { select: { entries: true } } } });
  return list.sort(compareExercises);
}

/** Library for the builder's picker. */
export async function getExerciseOptions() {
  const list = await db.exercise.findMany({ select: { id: true, name: true, category: true, met: true, muscleGroup: true } });
  return list.sort(compareExercises);
}

/** Every logged entry of one exercise, oldest first, with its workout date. */
export async function getExerciseHistory(exerciseId: string) {
  const [exercise, entries] = await Promise.all([
    db.exercise.findUnique({ where: { id: exerciseId } }),
    db.workoutEntry.findMany({
      where: { exerciseId },
      include: { sets: { orderBy: { setNo: "asc" } }, workout: { select: { id: true, date: true, startedAt: true } } },
    }),
  ]);
  entries.sort(
    (a, b) => a.workout.date.localeCompare(b.workout.date) || a.workout.startedAt.getTime() - b.workout.startedAt.getTime(),
  );
  return { exercise, entries };
}
