// Seeds the exercise library (MET values from the Compendium of Physical Activities)
// and the singleton profile. Safe to re-run.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const EXERCISES: { name: string; category: string; met: number; muscleGroup?: string }[] = [
  // Strength
  { name: "Squat (gánh tạ)", category: "strength", met: 5.0, muscleGroup: "Chân" },
  { name: "Deadlift", category: "strength", met: 6.0, muscleGroup: "Lưng" },
  { name: "Bench press (đẩy ngực)", category: "strength", met: 5.0, muscleGroup: "Ngực" },
  { name: "Incline dumbbell press", category: "strength", met: 5.0, muscleGroup: "Ngực" },
  { name: "Overhead press (đẩy vai)", category: "strength", met: 5.0, muscleGroup: "Vai" },
  { name: "Lateral raise", category: "strength", met: 3.5, muscleGroup: "Vai" },
  { name: "Barbell row (kéo tạ đòn)", category: "strength", met: 5.0, muscleGroup: "Lưng" },
  { name: "Lat pulldown", category: "strength", met: 3.5, muscleGroup: "Lưng" },
  { name: "Pull-up (hít xà)", category: "strength", met: 5.0, muscleGroup: "Lưng" },
  { name: "Seated cable row", category: "strength", met: 3.5, muscleGroup: "Lưng" },
  { name: "Leg press", category: "strength", met: 5.0, muscleGroup: "Chân" },
  { name: "Romanian deadlift", category: "strength", met: 5.0, muscleGroup: "Chân" },
  { name: "Lunge (chùng chân)", category: "strength", met: 3.8, muscleGroup: "Chân" },
  { name: "Leg curl / leg extension", category: "strength", met: 3.5, muscleGroup: "Chân" },
  { name: "Hip thrust", category: "strength", met: 3.8, muscleGroup: "Mông" },
  { name: "Bicep curl", category: "strength", met: 3.5, muscleGroup: "Tay" },
  { name: "Tricep pushdown", category: "strength", met: 3.5, muscleGroup: "Tay" },
  { name: "Push-up (hít đất)", category: "strength", met: 3.8, muscleGroup: "Ngực" },
  { name: "Plank / core", category: "strength", met: 3.8, muscleGroup: "Bụng" },
  { name: "Tập máy tổng hợp", category: "strength", met: 3.5 },
  { name: "Kettlebell swing", category: "strength", met: 9.8 },
  // Cardio
  { name: "Đi bộ (5 km/h)", category: "cardio", met: 3.5 },
  { name: "Đi bộ nhanh (6.4 km/h)", category: "cardio", met: 5.0 },
  { name: "Đi bộ dốc trên máy", category: "cardio", met: 6.0 },
  { name: "Chạy bộ (8 km/h)", category: "cardio", met: 8.3 },
  { name: "Chạy bộ (10 km/h)", category: "cardio", met: 9.8 },
  { name: "Chạy bộ (12 km/h)", category: "cardio", met: 11.0 },
  { name: "Đạp xe ngoài trời (vừa)", category: "cardio", met: 8.0 },
  { name: "Xe đạp tại chỗ (vừa)", category: "cardio", met: 6.8 },
  { name: "Máy elliptical", category: "cardio", met: 5.0 },
  { name: "Máy chèo thuyền (vừa)", category: "cardio", met: 7.0 },
  { name: "Leo cầu thang (stair climber)", category: "cardio", met: 9.0 },
  { name: "Nhảy dây", category: "cardio", met: 11.8 },
  { name: "Bơi (vừa)", category: "cardio", met: 5.8 },
  // HIIT
  { name: "HIIT", category: "hiit", met: 8.0 },
  { name: "Circuit training", category: "hiit", met: 8.0 },
  { name: "Burpee", category: "hiit", met: 8.0 },
  // Other
  { name: "Yoga", category: "other", met: 2.5 },
  { name: "Pilates", category: "other", met: 3.0 },
  { name: "Giãn cơ", category: "other", met: 2.3 },
  { name: "Cầu lông", category: "other", met: 5.5 },
  { name: "Bóng đá", category: "other", met: 7.0 },
  { name: "Pickleball", category: "other", met: 4.5 },
];

async function main() {
  for (const e of EXERCISES) {
    await db.exercise.upsert({ where: { name: e.name }, update: { met: e.met, category: e.category, muscleGroup: e.muscleGroup }, create: e });
  }
  await db.profile.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  console.log(`Seeded ${EXERCISES.length} exercises`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
