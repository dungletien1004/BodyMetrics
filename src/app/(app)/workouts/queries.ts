import "server-only";
import { db } from "@/lib/db";
import { compareExercises } from "@/lib/workouts";

// Every query is scoped to one user's workouts. The exercise library is the shared rows
// (userId = null) plus that user's own custom exercises.

const entryInclude = {
  orderBy: { order: "asc" },
  include: { exercise: true, sets: { orderBy: { setNo: "asc" } } },
} as const;

export function visibleExercises(userId: string) {
  return { OR: [{ userId: null }, { userId }] };
}

export async function getWorkoutsBetween(userId: string, from: string, to: string) {
  return db.workout.findMany({
    where: { userId, date: { gte: from, lte: to } },
    orderBy: [{ date: "asc" }, { startedAt: "asc" }],
    include: { entries: entryInclude },
  });
}

export async function getWorkout(userId: string, id: string) {
  return db.workout.findFirst({ where: { id, userId }, include: { entries: entryInclude } });
}

export type WorkoutWithEntries = NonNullable<Awaited<ReturnType<typeof getWorkout>>>;

export async function listExercises(userId: string) {
  const list = await db.exercise.findMany({
    where: visibleExercises(userId),
    include: { _count: { select: { entries: { where: { workout: { userId } } } } } },
  });
  return list.sort(compareExercises);
}

/** Library for the builder's picker. */
export async function getExerciseOptions(userId: string) {
  const list = await db.exercise.findMany({
    where: visibleExercises(userId),
    select: { id: true, name: true, category: true, met: true, muscleGroup: true },
  });
  return list.sort(compareExercises);
}

/** Every logged entry of one exercise by this user, oldest first, with its workout date. */
export async function getExerciseHistory(userId: string, exerciseId: string) {
  const [exercise, entries] = await Promise.all([
    db.exercise.findFirst({ where: { id: exerciseId, ...visibleExercises(userId) } }),
    db.workoutEntry.findMany({
      where: { exerciseId, workout: { userId } },
      include: { sets: { orderBy: { setNo: "asc" } }, workout: { select: { id: true, date: true, startedAt: true } } },
    }),
  ]);
  entries.sort(
    (a, b) => a.workout.date.localeCompare(b.workout.date) || a.workout.startedAt.getTime() - b.workout.startedAt.getTime(),
  );
  return { exercise, entries };
}
