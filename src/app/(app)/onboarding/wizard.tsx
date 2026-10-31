"use client";

import { addWeeks, format } from "date-fns";
import { Check } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { ACTIVITY_LEVELS, clampNote, deficitForPace, energyPlan, PACES, proteinTarget, rateLabel } from "@/lib/calc";
import { kcal, num } from "@/lib/format";
import { finishOnboarding, type OnboardingState } from "./actions";

const STEPS = ["Về bạn", "Cân nặng", "Kế hoạch"];
const PROTEIN_PER_KG = 1.8;

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/** "72,4" or "72.4" -> 72.4; blank or junk -> null. */
function parse(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function OnboardingWizard({ initialName, initialWeight, thisYear }: { initialName: string; initialWeight: number | null; thisYear: number }) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(finishOnboarding, null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [sex, setSex] = useState<"male" | "female" | null>(null);
  const [birthYear, setBirthYear] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState(initialWeight != null ? String(initialWeight).replace(".", ",") : "");
  const [goal, setGoal] = useState("");
  const [activity, setActivity] = useState<number | null>(null);
  const [pace, setPace] = useState(0.5);

  const by = parse(birthYear);
  const h = parse(height);
  const w = parse(weight);
  const g = parse(goal);

  function problem(s: number): string | null {
    if (s === 0) {
      if (!sex) return "Chọn giới tính.";
      if (by == null || by < 1920 || by > thisYear - 10) return "Nhập năm sinh, ví dụ 1990.";
      if (h == null || h < 100 || h > 250) return "Nhập chiều cao từ 100 đến 250 cm.";
    }
    if (s === 1) {
      if (w == null || w < 25 || w > 350) return "Nhập cân nặng hiện tại (kg).";
      if (g == null || g < 25) return "Nhập cân nặng mục tiêu (kg).";
      if (g >= w) return "Cân nặng mục tiêu cần thấp hơn cân nặng hiện tại.";
    }
    if (s === 2 && activity == null) return "Chọn mức vận động thường ngày.";
    return null;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const p = problem(step);
    setError(p);
    if (p) return e.preventDefault();
    if (step < 2) {
      e.preventDefault();
      setStep(step + 1);
      window.scrollTo({ top: 0 });
    }
    // Last step: the form action runs.
  }

  const healthy = h ? { min: Math.round(18.5 * (h / 100) ** 2), max: Math.floor(24.9 * (h / 100) ** 2) } : null;
  const goalBmi = h && g ? g / (h / 100) ** 2 : null;
  const plan =
    sex && by && h && w && g && activity
      ? energyPlan({ sex, birthYear: by, heightCm: h, activityFactor: activity, dailyDeficit: deficitForPace(pace), proteinPerKg: PROTEIN_PER_KG, goalWeightKg: g }, w)
      : null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="text-sm text-muted">
        Bước {step + 1}/3 · {STEPS[step]}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <div key={s} className={cn("h-1.5 rounded-full", i <= step ? "bg-accent" : "bg-surface-2")} />
        ))}
      </div>

      <form action={formAction} onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
        {step === 0 && (
          <>
            <Heading title="Thiết lập ban đầu" sub="Vài thông tin để tính năng lượng nền (BMR) và mục tiêu calo cho riêng bạn." />
            <Labeled label="Tên gọi (tùy chọn)">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
            </Labeled>
            <Labeled label="Giới tính">
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Giới tính">
                <Choice selected={sex === "male"} onClick={() => setSex("male")}>
                  Nam
                </Choice>
                <Choice selected={sex === "female"} onClick={() => setSex("female")}>
                  Nữ
                </Choice>
              </div>
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Năm sinh">
                <input className={inputClass} value={birthYear} onChange={(e) => setBirthYear(e.target.value)} inputMode="numeric" placeholder="1990" />
              </Labeled>
              <Labeled label="Chiều cao (cm)">
                <input className={inputClass} value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" placeholder="165" />
              </Labeled>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Heading title="Cân nặng" sub="Cân nặng hôm nay được ghi làm lần cân đầu tiên trong nhật ký. Cân buổi sáng, trước khi ăn là chuẩn nhất." />
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Hiện tại (kg)">
                <input className={inputClass} value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="68,5" />
              </Labeled>
              <Labeled label="Mục tiêu (kg)">
                <input className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="decimal" placeholder="60" />
              </Labeled>
            </div>
            {healthy && (
              <p className="text-sm text-muted">
                Với chiều cao {num(h)} cm, cân nặng khỏe mạnh khoảng {healthy.min}–{healthy.max} kg (BMI 18,5–24,9).
              </p>
            )}
            {goalBmi != null && goalBmi < 18.5 && (
              <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
                Mục tiêu này có BMI {num(goalBmi)}, dưới mức 18,5 là thiếu cân. Bạn nên chọn mục tiêu cao hơn.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Heading title="Kế hoạch" sub="Mức vận động thường ngày, chưa tính buổi tập. Buổi tập được cộng riêng vào ngày bạn tập." />
            <div className="space-y-2" role="radiogroup" aria-label="Mức vận động">
              {ACTIVITY_LEVELS.map((a) => (
                <Choice key={a.value} selected={activity === a.value} onClick={() => setActivity(a.value)} className="text-left">
                  <span className="block font-medium">{a.label}</span>
                  <span className="block text-sm text-muted">{a.detail}</span>
                </Choice>
              ))}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Tốc độ giảm mong muốn</div>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tốc độ giảm">
                {PACES.map((p) => (
                  <Choice key={p.kgPerWeek} selected={pace === p.kgPerWeek} onClick={() => setPace(p.kgPerWeek)}>
                    <span className="block font-medium">{p.label}</span>
                    <span className="block text-xs text-muted">{rateLabel(p.kgPerWeek)}</span>
                    <span className="block text-xs text-muted">kg/tuần</span>
                  </Choice>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Thâm hụt khoảng {kcal(deficitForPace(pace))} kcal mỗi ngày. Chậm dễ giữ lâu dài hơn.</p>
            </div>

            {plan && (
              <div className="space-y-3 rounded-2xl border border-accent/40 bg-accent/5 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <Figure label="Ăn mỗi ngày" value={kcal(plan.targetKcal)} unit="kcal" />
                  <Figure label="Đạm" value={String(proteinTarget({ proteinPerKg: PROTEIN_PER_KG, goalWeightKg: g }, w!))} unit="g/ngày" />
                  <Figure label="Tốc độ thực tế" value={rateLabel(plan.kgPerWeek)} unit="kg/tuần" />
                  <Figure
                    label="Tới mục tiêu"
                    value={plan.weeksToGoal != null ? String(plan.weeksToGoal) : "–"}
                    unit="tuần"
                    sub={plan.weeksToGoal != null ? `khoảng tháng ${format(addWeeks(new Date(), plan.weeksToGoal), "M/yyyy")}` : undefined}
                  />
                </div>
                <p className="text-xs text-muted">
                  Ngày có tập được ăn thêm phần calo đã đốt. Đạm tính {num(PROTEIN_PER_KG)} g × cân nặng mục tiêu (khuyến nghị 1,6–2,2 g/kg), đổi được trong Hồ sơ.
                </p>
                {plan.clamped && <p className="text-sm text-danger">{clampNote(plan.bmr)}</p>}
              </div>
            )}
          </>
        )}

        {/* Steps unmount their inputs, so the action reads the values from here. */}
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="sex" value={sex ?? ""} />
        <input type="hidden" name="birthYear" value={birthYear} />
        <input type="hidden" name="heightCm" value={height} />
        <input type="hidden" name="weightKg" value={weight} />
        <input type="hidden" name="goalWeightKg" value={goal} />
        <input type="hidden" name="activityFactor" value={activity ?? ""} />
        <input type="hidden" name="pace" value={pace} />

        {(error ?? state?.error) && (
          <p role="alert" className="text-sm text-danger">
            {error ?? state?.error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          {step > 0 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(step - 1);
              }}
              className="h-12 flex-1 rounded-xl border border-border bg-surface font-medium hover:bg-surface-2"
            >
              Quay lại
            </button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="h-12 flex-[2] rounded-xl bg-accent font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {step < 2 ? "Tiếp tục" : pending ? "Đang lưu…" : "Bắt đầu"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Choice({ selected, onClick, className, children }: { selected: boolean; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "relative flex min-h-12 w-full flex-col justify-center rounded-xl border px-4 py-3 transition",
        selected ? "border-accent bg-accent/10 ring-2 ring-accent/30" : "border-border bg-surface hover:bg-surface-2",
        className,
      )}
    >
      {children}
      {selected && <Check className="absolute top-2 right-2 size-4 text-accent" />}
    </button>
  );
}

function Figure({ label, value, unit, sub }: { label: string; value: string; unit: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-semibold tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
      </div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
