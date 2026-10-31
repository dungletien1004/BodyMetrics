// Checks for the energy math in src/lib/calc.ts. Run: npx tsx scripts/check-calc.ts
import assert from "node:assert/strict";
import { baselineTdee, bmr, deficitForPace, energyPlan, intakeTarget, kgPerWeekFromDeficit, proteinTarget, weeksToGoal } from "../src/lib/calc";

const year = new Date().getFullYear();
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const man = { sex: "male", birthYear: year - 30, heightCm: 175, activityFactor: 1.3, dailyDeficit: 550, proteinPerKg: 1.8, goalWeightKg: 75 };
// The reviewer's case: woman, 28, 158 cm, 62 kg, sedentary, asks for 0,5 kg/week.
const woman = { sex: "female", birthYear: year - 28, heightCm: 158, activityFactor: 1.2, dailyDeficit: 500, proteinPerKg: 1.8, goalWeightKg: 55 };

check("bmr: Mifflin-St Jeor for men and women", () => {
  assert.equal(bmr(man, 90), 1849); // 900 + 1093.75 - 150 + 5
  assert.equal(bmr(woman, 62), 1307); // 620 + 987.5 - 140 - 161 = 1306.5
});

check("baseline TDEE = BMR x activity", () => {
  assert.equal(baselineTdee(man, 90), Math.round(1849 * 1.3));
  assert.equal(baselineTdee(woman, 62), 1568);
});

check("target = TDEE - deficit when that stays above BMR", () => {
  assert.equal(intakeTarget(man, 90, 0), 2404 - 550);
  assert.equal(intakeTarget(man, 90, 300), 2404 + 300 - 550);
});

check("target is clamped at BMR", () => {
  assert.equal(intakeTarget(woman, 62, 0), 1307);
});

check("pace <-> deficit", () => {
  assert.equal(deficitForPace(0.25), 275);
  assert.equal(deficitForPace(0.5), 550);
  assert.equal(deficitForPace(0.75), 825);
  assert.equal(kgPerWeekFromDeficit(550), 0.5);
});

check("plan without clamp keeps the planned rate", () => {
  const p = energyPlan(man, 90);
  assert.equal(p.clamped, false);
  assert.equal(p.deficit, 550);
  assert.equal(p.kgPerWeek, 0.5);
  assert.equal(p.weeksToGoal, 30); // 15 kg / 0,5
});

check("plan with clamp reports the real deficit and rate", () => {
  const p = energyPlan(woman, 62);
  assert.equal(p.clamped, true);
  assert.equal(p.targetKcal, 1307);
  assert.equal(p.deficit, 261);
  assert.equal(Math.round(p.kgPerWeek * 100) / 100, 0.24);
  assert.equal(p.plannedKgPerWeek, 500 * 7 / 7700);
  assert.equal(p.weeksToGoal, Math.ceil(7 / (261 * 7 / 7700))); // 30, not the promised 15
});

check("plan with no room above BMR loses nothing and has no ETA", () => {
  const p = energyPlan({ ...woman, activityFactor: 1 }, 62);
  assert.equal(p.deficit, 0);
  assert.equal(p.kgPerWeek, 0);
  assert.equal(p.weeksToGoal, null);
});

check("protein uses goal weight when set, else current weight", () => {
  assert.equal(proteinTarget({ proteinPerKg: 1.8, goalWeightKg: 75 }, 110), 135);
  assert.equal(proteinTarget({ proteinPerKg: 1.8, goalWeightKg: null }, 110), 198);
  assert.equal(proteinTarget({ proteinPerKg: 1.6 }, 60), 96);
});

check("weeksToGoal", () => {
  assert.equal(weeksToGoal(80, 75, -0.5), 10);
  assert.equal(weeksToGoal(80, 80, -0.5), null);
  assert.equal(weeksToGoal(80, 75, 0), null);
});

console.log(`\n${passed} checks passed`);
