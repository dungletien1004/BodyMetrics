// Dev-only demo data for building and checking charts: ~8 weeks of weigh-ins, meals and workouts.
//
//   npx tsx prisma/demo-data.ts --yes             insert demo rows (refuses without --yes)
//   npx tsx prisma/demo-data.ts --yes --set-goal  also fill the profile's start/goal weight if empty
//   npx tsx prisma/demo-data.ts --clean           delete every row tagged "[demo]"
//   add --user=<username> to target that account (default: the first admin)
//
// Only inserts. Every inserted Meal / Workout / BodyLog has a note starting with "[demo]".
import { PrismaClient } from "@prisma/client";
import { exerciseKcal, type Intensity } from "../src/lib/calc";
import { dayRange, shiftDay, todayKey } from "../src/lib/dates";

const db = new PrismaClient();
const TAG = "[demo]";
const WEEKS = 8;
let USER_ID = ""; // whose data, resolved in main()
const START_KG = 86;
const KG_PER_WEEK = -0.4;

// Deterministic RNG so reruns look the same.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261029);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const noise = (sd: number) => (rand() + rand() + rand() - 1.5) * sd * 2; // ~normal

type Food = { name: string; portionG: number; kcal: number; p: number; c: number; f: number };
const F = (name: string, portionG: number, kcal: number, p: number, c: number, f: number): Food => ({ name, portionG, kcal, p, c, f });

const BREAKFAST: Food[][] = [
  [F("Phở bò", 550, 450, 28, 55, 12)],
  [F("Bánh mì trứng", 180, 380, 15, 45, 15), F("Cà phê sữa đá", 200, 120, 2, 20, 4)],
  [F("Yến mạch + sữa tươi", 300, 300, 12, 48, 7), F("Chuối", 120, 105, 1, 27, 0)],
  [F("Xôi gà", 250, 500, 20, 70, 15)],
  [F("Trứng luộc (2 quả)", 100, 155, 13, 1, 11), F("Bánh mì đen", 60, 150, 6, 28, 2), F("Sữa chua Hy Lạp", 150, 130, 17, 8, 3)],
];
const MAIN: Food[][] = [
  [F("Cơm trắng", 150, 200, 4, 44, 0.5), F("Ức gà áp chảo", 150, 250, 46, 0, 5), F("Rau muống xào tỏi", 150, 120, 4, 8, 8)],
  [F("Cơm tấm sườn", 400, 650, 30, 80, 22)],
  [F("Bún chả", 450, 550, 25, 65, 20)],
  [F("Cơm trắng", 150, 200, 4, 44, 0.5), F("Cá hồi áp chảo", 150, 310, 32, 0, 20), F("Canh chua", 300, 90, 6, 10, 2)],
  [F("Cơm trắng", 150, 200, 4, 44, 0.5), F("Thịt kho trứng", 200, 400, 25, 8, 30), F("Rau luộc", 150, 50, 3, 8, 0.5)],
  [F("Gỏi cuốn (3 cuốn)", 250, 250, 15, 35, 5), F("Đậu hũ sốt cà", 200, 220, 14, 10, 14)],
  [F("Cơm trắng", 100, 130, 3, 29, 0.3), F("Bò xào bông cải", 250, 330, 30, 12, 18)],
  [F("Mì gói trứng", 350, 450, 14, 52, 20)],
];
const SNACK: Food[][] = [
  [F("Whey protein", 30, 120, 24, 3, 1.5)],
  [F("Táo", 180, 95, 0.5, 25, 0.3)],
  [F("Hạt điều", 30, 165, 5, 9, 13)],
  [F("Sữa chua Hy Lạp", 150, 130, 17, 8, 3)],
  [F("Trà sữa trân châu", 500, 450, 4, 75, 14)],
  [F("Bánh quy", 50, 240, 3, 32, 11)],
];

const STRENGTH_DAYS: { name: string; reps: number; kg: number }[][] = [
  [
    { name: "Squat (gánh tạ)", reps: 8, kg: 70 },
    { name: "Romanian deadlift", reps: 10, kg: 60 },
    { name: "Leg press", reps: 12, kg: 120 },
    { name: "Plank / core", reps: 0, kg: 0 },
  ],
  [
    { name: "Bench press (đẩy ngực)", reps: 8, kg: 60 },
    { name: "Overhead press (đẩy vai)", reps: 8, kg: 35 },
    { name: "Incline dumbbell press", reps: 10, kg: 20 },
    { name: "Tricep pushdown", reps: 12, kg: 25 },
  ],
  [
    { name: "Deadlift", reps: 5, kg: 100 },
    { name: "Lat pulldown", reps: 10, kg: 55 },
    { name: "Barbell row (kéo tạ đòn)", reps: 8, kg: 55 },
    { name: "Bicep curl", reps: 12, kg: 12 },
  ],
];
const CARDIO = ["Chạy bộ (8 km/h)", "Đạp xe ngoài trời (vừa)", "Đi bộ dốc trên máy", "Máy chèo thuyền (vừa)"];

function at(day: string, hour: number, minute: number): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute);
}

function scale(food: Food, k: number): Food {
  const r = (n: number) => Math.round(n * k * 10) / 10;
  return { ...food, portionG: Math.round(food.portionG * k), kcal: Math.round(food.kcal * k), p: r(food.p), c: r(food.c), f: r(food.f) };
}

async function insertMeal(day: string, type: string, time: Date, foods: Food[]) {
  await db.meal.create({
    data: {
      userId: USER_ID,
      date: day,
      type,
      eatenAt: time,
      note: TAG,
      items: {
        create: foods.map((x) => ({ name: x.name, portionG: x.portionG, kcal: x.kcal, proteinG: x.p, carbG: x.c, fatG: x.f })),
      },
    },
  });
}

async function seed(setGoal: boolean) {
  const existing = await db.meal.count({ where: { userId: USER_ID, note: { startsWith: TAG } } });
  if (existing > 0) {
    console.log(`Đã có ${existing} bữa ăn demo. Chạy với --clean trước nếu muốn tạo lại.`);
    return;
  }
  const exercises = new Map((await db.exercise.findMany({ where: { userId: null } })).map((e) => [e.name, e]));
  if (exercises.size === 0) throw new Error("Exercise library is empty - run `npm run setup` first.");

  const today = todayKey();
  const from = shiftDay(today, -(WEEKS * 7 - 1));
  const days = dayRange(from, today);
  let weighIns = 0;
  let meals = 0;
  let workouts = 0;

  for (const [i, day] of days.entries()) {
    const dow = new Date(at(day, 12, 0)).getDay(); // 0 = Sunday
    const weekend = dow === 0 || dow === 6;
    const trendKg = START_KG + (KG_PER_WEEK / 7) * i;
    // Water-weight swing: heavier after weekends.
    const weightKg = Math.round((trendKg + noise(0.35) + (dow === 1 ? 0.3 : 0)) * 10) / 10;

    if (chance(0.82) || i === days.length - 1) {
      await db.bodyLog.create({
        data: { userId: USER_ID, date: day, weightKg, waistCm: i % 7 === 0 ? Math.round((96 - i * 0.07) * 10) / 10 : null, note: TAG, createdAt: at(day, 6, 45) },
      });
      weighIns++;
    }

    // Logging gaps: ~6% of days with no food logged at all (never today).
    if (i < days.length - 1 && chance(0.06)) continue;

    const portion = weekend ? 1.15 : 1;
    await insertMeal(day, "breakfast", at(day, 7, Math.floor(rand() * 50)), pick(BREAKFAST).map((x) => scale(x, portion)));
    await insertMeal(day, "lunch", at(day, 12, Math.floor(rand() * 40)), pick(MAIN).map((x) => scale(x, portion)));
    meals += 2;
    if (i === days.length - 1) continue; // today: only the first meals so far

    await insertMeal(day, "dinner", at(day, 18 + Math.floor(rand() * 2), Math.floor(rand() * 59)), pick(MAIN).map((x) => scale(x, portion * (0.9 + rand() * 0.3))));
    meals++;
    if (chance(0.7)) {
      // Protein shake most afternoons, gradually more often as habits improve.
      const snack = chance(0.35 + (i / days.length) * 0.4) ? [SNACK[0][0], SNACK[3][0]] : pick(SNACK);
      await insertMeal(day, "snack", at(day, 15, Math.floor(rand() * 59)), snack);
      meals++;
    }
    if (chance(weekend ? 0.45 : 0.15)) {
      await insertMeal(day, "snack", at(day, 22, Math.floor(rand() * 59)), pick(SNACK.slice(2)));
      meals++;
    }

    // Workouts: strength Mon/Wed/Fri (sometimes skipped), cardio on Saturday.
    const strengthIdx = { 1: 0, 3: 1, 5: 2 }[dow as 1 | 3 | 5];
    if (strengthIdx != null && chance(0.85)) {
      const plan = STRENGTH_DAYS[strengthIdx];
      const progress = 1 + i * 0.002; // slow strength progression
      const intensity: Intensity = chance(0.3) ? "vigorous" : "moderate";
      await db.workout.create({
        data: {
          userId: USER_ID,
          date: day,
          startedAt: at(day, 18, 0),
          durationMin: 60,
          note: TAG,
          entries: {
            create: plan.map((p, order) => {
              const ex = exercises.get(p.name)!;
              const minutes = 12;
              return {
                exerciseId: ex.id,
                order,
                durationMin: minutes,
                intensity,
                kcal: exerciseKcal(ex.met, weightKg, minutes, intensity),
                sets: {
                  create: Array.from({ length: p.reps ? 4 : 3 }, (_, s) => ({
                    setNo: s + 1,
                    reps: p.reps || null,
                    weightKg: p.kg ? Math.round((p.kg * progress) / 2.5) * 2.5 : null,
                  })),
                },
              };
            }),
          },
        },
      });
      workouts++;
    }
    if (dow === 6 && chance(0.8)) {
      const ex = exercises.get(pick(CARDIO))!;
      const minutes = 30 + Math.floor(rand() * 4) * 5;
      await db.workout.create({
        data: {
          userId: USER_ID,
          date: day,
          startedAt: at(day, 7, 30),
          durationMin: minutes,
          note: TAG,
          entries: {
            create: [
              {
                exerciseId: ex.id,
                durationMin: minutes,
                intensity: "moderate",
                distanceKm: ex.name.startsWith("Chạy") ? Math.round((minutes / 60) * 8 * 10) / 10 : null,
                kcal: exerciseKcal(ex.met, weightKg, minutes, "moderate"),
              },
            ],
          },
        },
      });
      workouts++;
    }
  }

  if (setGoal) {
    const p = await db.profile.upsert({ where: { userId: USER_ID }, update: {}, create: { userId: USER_ID } });
    if (p.startWeightKg == null || p.goalWeightKg == null) {
      await db.profile.update({
        where: { userId: USER_ID },
        data: { startWeightKg: p.startWeightKg ?? START_KG, goalWeightKg: p.goalWeightKg ?? 78 },
      });
      console.log("Đã điền cân nặng ban đầu / mục tiêu còn trống trong hồ sơ.");
    }
  }

  console.log(`Demo ${from} → ${today}: ${weighIns} lần cân, ${meals} bữa ăn, ${workouts} buổi tập.`);
}

async function clean() {
  const where = { userId: USER_ID, note: { startsWith: TAG } };
  const [meals, workouts, logs] = await db.$transaction([
    db.meal.deleteMany({ where }),
    db.workout.deleteMany({ where }),
    db.bodyLog.deleteMany({ where }),
  ]);
  console.log(`Đã xoá demo: ${meals.count} bữa ăn, ${workouts.count} buổi tập, ${logs.count} lần cân.`);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const username = argv.find((a) => a.startsWith("--user="))?.slice("--user=".length);
  const user = username
    ? await db.user.findUnique({ where: { username } })
    : await db.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" } });
  if (!user) {
    console.error(username ? `Không có tài khoản "${username}".` : "Chưa có tài khoản admin nào. Đăng nhập lần đầu để tạo.");
    process.exitCode = 1;
    return;
  }
  USER_ID = user.id;
  console.log(`Tài khoản: ${user.username}`);
  if (args.has("--clean")) return clean();
  if (!args.has("--yes")) {
    console.error("Script này chèn dữ liệu demo vào DB hiện tại. Chạy lại với --yes để xác nhận (hoặc --clean để xoá).");
    process.exitCode = 1;
    return;
  }
  await seed(args.has("--set-goal"));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
