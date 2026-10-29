"use client";

import { Copy, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { saveWorkout, weightForDay } from "@/app/workouts/actions";
import { Badge, Button, Card, CardTitle, Field, Input, Textarea, cn } from "@/components/ui";
import { exerciseKcal, INTENSITY_LABEL, type Intensity } from "@/lib/calc";
import { isDayKey } from "@/lib/dates";
import { kcal, num, parseNum } from "@/lib/format";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  DEFAULT_CARDIO_MINUTES,
  INTENSITIES,
  MINUTES_PER_SET,
  categoryLabel,
  setsVolume,
  type Category,
  type WorkoutPayload,
} from "@/lib/workouts";

export interface ExerciseOption {
  id: string;
  name: string;
  category: string;
  met: number;
  muscleGroup: string | null;
}

interface SetRow {
  key: string;
  reps: string;
  kg: string;
}

interface EntryRow {
  key: string;
  exerciseId: string;
  minutes: string;
  minutesAuto: boolean; // strength minutes follow the set count until edited
  intensity: Intensity;
  distance: string;
  sets: SetRow[];
}

let seq = 0;
const uid = () => `r${++seq}`;
const str = (n: number | null | undefined) => (n == null ? "" : String(n));

function newSet(reps = "", kg = ""): SetRow {
  return { key: uid(), reps, kg };
}

function newEntry(ex: ExerciseOption): EntryRow {
  const strength = ex.category === "strength";
  return {
    key: uid(),
    exerciseId: ex.id,
    minutes: String(strength ? 3 * MINUTES_PER_SET : DEFAULT_CARDIO_MINUTES),
    minutesAuto: strength,
    intensity: "moderate",
    distance: "",
    sets: strength ? [newSet(), newSet(), newSet()] : [],
  };
}

function rowsFromPayload(p: WorkoutPayload): EntryRow[] {
  return p.entries.map((e) => ({
    key: uid(),
    exerciseId: e.exerciseId,
    minutes: str(e.durationMin),
    minutesAuto: false,
    intensity: e.intensity,
    distance: str(e.distanceKm),
    sets: e.sets.map((s) => newSet(str(s.reps), str(s.weightKg))),
  }));
}

const minutesOf = (e: EntryRow) => Math.max(0, parseNum(e.minutes) ?? 0);

export function WorkoutBuilder({
  exercises,
  initial,
  initialWeightKg,
  workoutId = null,
}: {
  exercises: ExerciseOption[];
  initial: WorkoutPayload;
  initialWeightKg: number;
  workoutId?: string | null;
}) {
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [duration, setDuration] = useState(str(initial.durationMin));
  const [override, setOverride] = useState(str(initial.kcalOverride));
  const [note, setNote] = useState(initial.note);
  const [entries, setEntries] = useState<EntryRow[]>(() => rowsFromPayload(initial));
  const [weight, setWeight] = useState(initialWeightKg);
  const [pickerOpen, setPickerOpen] = useState(initial.entries.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const entryKcal = (e: EntryRow) => {
    const ex = byId.get(e.exerciseId);
    return ex ? exerciseKcal(ex.met, weight, minutesOf(e), e.intensity) : 0;
  };
  const totalMinutes = entries.reduce((a, e) => a + minutesOf(e), 0);
  const estimate = entries.reduce((a, e) => a + entryKcal(e), 0);
  const overrideKcal = parseNum(override);
  const volume = entries.reduce(
    (a, e) => a + setsVolume(e.sets.map((s) => ({ reps: parseNum(s.reps), weightKg: parseNum(s.kg) }))),
    0,
  );

  function update(key: string, fn: (e: EntryRow) => EntryRow) {
    setEntries((list) => list.map((e) => (e.key === key ? fn(e) : e)));
  }

  function updateSets(key: string, fn: (sets: SetRow[]) => SetRow[]) {
    update(key, (e) => {
      const sets = fn(e.sets);
      return { ...e, sets, minutes: e.minutesAuto ? String(Math.max(1, sets.length) * MINUTES_PER_SET) : e.minutes };
    });
  }

  function changeDate(v: string) {
    setDate(v);
    if (isDayKey(v)) weightForDay(v).then((w) => w != null && setWeight(w));
  }

  function submit() {
    setError(null);
    if (!entries.length) return setError("Thêm ít nhất một bài tập.");
    const payload: WorkoutPayload = {
      date,
      startTime,
      durationMin: parseNum(duration),
      kcalOverride: overrideKcal,
      note,
      entries: entries.map((e) => ({
        exerciseId: e.exerciseId,
        durationMin: minutesOf(e),
        intensity: e.intensity,
        distanceKm: parseNum(e.distance),
        sets: e.sets.map((s) => ({ reps: parseNum(s.reps), weightKg: parseNum(s.kg) })),
      })),
    };
    startSaving(async () => {
      const res = await saveWorkout(workoutId, payload);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        submit();
      }}
    >
      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Ngày">
            <Input type="date" required value={date} onChange={(e) => changeDate(e.target.value)} />
          </Field>
          <Field label="Giờ bắt đầu">
            <Input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Tổng thời gian (phút)" hint="Để trống = tổng phút tập" className="col-span-2 sm:col-span-1">
            <Input
              inputMode="numeric"
              value={duration}
              placeholder={String(Math.round(totalMinutes))}
              onChange={(e) => setDuration(e.target.value)}
            />
          </Field>
          <Field label="Calo từ đồng hồ thông minh" hint="Tuỳ chọn - thay cho ước tính MET" className="col-span-2 sm:col-span-1">
            <Input inputMode="numeric" value={override} placeholder="kcal" onChange={(e) => setOverride(e.target.value)} />
          </Field>
        </div>
        <Field label="Ghi chú" className="mt-3">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cảm giác, giấc ngủ, chấn thương…" />
        </Field>
      </Card>

      {entries.map((e, i) => {
        const ex = byId.get(e.exerciseId);
        if (!ex) return null;
        return (
          <EntryCard
            key={e.key}
            index={i}
            entry={e}
            exercise={ex}
            kcalValue={entryKcal(e)}
            onChange={(fn) => update(e.key, fn)}
            onSets={(fn) => updateSets(e.key, fn)}
            onRemove={() => setEntries((list) => list.filter((x) => x.key !== e.key))}
          />
        );
      })}

      {pickerOpen ? (
        <ExercisePicker
          exercises={exercises}
          onPick={(ex) => {
            setEntries((list) => [...list, newEntry(ex)]);
            setPickerOpen(false);
          }}
          onClose={entries.length ? () => setPickerOpen(false) : undefined}
        />
      ) : (
        <Button type="button" variant="secondary" className="w-full" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" /> Thêm bài tập
        </Button>
      )}

      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 md:bottom-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
          <div className="min-w-0 text-sm">
            <div className="font-semibold tabular-nums text-burn">
              {kcal(overrideKcal ?? estimate)} kcal
              {overrideKcal != null && <span className="ml-1.5 font-normal text-muted line-through">{kcal(estimate)}</span>}
            </div>
            <div className="truncate text-xs text-muted">
              {Math.round(parseNum(duration) ?? totalMinutes)} phút
              {volume > 0 && ` · ${num(volume, 0)} kg khối lượng`} · tính với {num(weight)} kg
            </div>
            {error && <div className="mt-1 text-xs text-danger">{error}</div>}
          </div>
          <Button type="submit" disabled={saving || !entries.length} className="shrink-0">
            {saving ? "Đang lưu…" : "Lưu buổi tập"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function EntryCard({
  index,
  entry: e,
  exercise: ex,
  kcalValue,
  onChange,
  onSets,
  onRemove,
}: {
  index: number;
  entry: EntryRow;
  exercise: ExerciseOption;
  kcalValue: number;
  onChange: (fn: (e: EntryRow) => EntryRow) => void;
  onSets: (fn: (sets: SetRow[]) => SetRow[]) => void;
  onRemove: () => void;
}) {
  const strength = ex.category === "strength";
  const setSet = (key: string, patch: Partial<SetRow>) => onSets((sets) => sets.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">
            <span className="mr-1.5 text-muted">{index + 1}.</span>
            {ex.name}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge>{categoryLabel(ex.category)}</Badge>
            {ex.muscleGroup && <Badge>{ex.muscleGroup}</Badge>}
            <Badge>MET {num(ex.met)}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-sm font-semibold tabular-nums text-burn">{kcal(kcalValue)} kcal</span>
          <button type="button" onClick={onRemove} aria-label="Xoá bài tập" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {strength && (
        <div>
          <div className="grid grid-cols-[2rem_1fr_1fr_2.25rem] gap-2 px-1 pb-1 text-xs text-muted">
            <span>Set</span>
            <span>Số lần</span>
            <span>Tạ (kg)</span>
            <span />
          </div>
          <div className="space-y-2">
            {e.sets.map((s, j) => (
              <div key={s.key} className="grid grid-cols-[2rem_1fr_1fr_2.25rem] items-center gap-2">
                <span className="text-center text-sm text-muted tabular-nums">{j + 1}</span>
                <Input inputMode="numeric" aria-label={`Số lần set ${j + 1}`} value={s.reps} onChange={(ev) => setSet(s.key, { reps: ev.target.value })} />
                <Input inputMode="decimal" aria-label={`Tạ set ${j + 1}`} value={s.kg} onChange={(ev) => setSet(s.key, { kg: ev.target.value })} />
                <button
                  type="button"
                  aria-label={`Xoá set ${j + 1}`}
                  onClick={() => onSets((sets) => sets.filter((x) => x.key !== s.key))}
                  className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="secondary" className="flex-1 px-2" onClick={() => onSets((sets) => [...sets, newSet()])}>
              <Plus className="size-4" /> Thêm set
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1 px-2"
              disabled={!e.sets.length}
              onClick={() =>
                onSets((sets) => {
                  const last = sets[sets.length - 1];
                  return last ? [...sets, newSet(last.reps, last.kg)] : sets;
                })
              }
            >
              <Copy className="size-4" /> Lặp set cuối
            </Button>
          </div>
        </div>
      )}

      <div className={cn("grid gap-3", strength ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        <Field label={strength ? "Phút tập thực tế" : "Thời gian (phút)"} hint={strength && e.minutesAuto ? `Ước tính ${MINUTES_PER_SET} phút/set` : undefined}>
          <Input inputMode="decimal" value={e.minutes} onChange={(ev) => onChange((x) => ({ ...x, minutes: ev.target.value, minutesAuto: false }))} />
        </Field>
        {!strength && (
          <Field label="Quãng đường (km)">
            <Input inputMode="decimal" value={e.distance} placeholder="Tuỳ chọn" onChange={(ev) => onChange((x) => ({ ...x, distance: ev.target.value }))} />
          </Field>
        )}
        <div className={cn("space-y-1", !strength && "col-span-2 sm:col-span-1")}>
          <span className="text-sm font-medium">Cường độ</span>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-border p-1">
            {INTENSITIES.map((it) => (
              <button
                key={it}
                type="button"
                aria-pressed={e.intensity === it}
                onClick={() => onChange((x) => ({ ...x, intensity: it }))}
                className={cn(
                  "rounded-lg py-1.5 text-sm transition",
                  e.intensity === it ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2",
                )}
              >
                {INTENSITY_LABEL[it]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ExercisePicker({
  exercises,
  onPick,
  onClose,
}: {
  exercises: ExerciseOption[];
  onPick: (ex: ExerciseOption) => void;
  onClose?: () => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const needle = q.trim().toLowerCase();
  const list = exercises.filter(
    (e) =>
      (cat === "all" || e.category === cat) &&
      (!needle || e.name.toLowerCase().includes(needle) || e.muscleGroup?.toLowerCase().includes(needle)),
  );

  return (
    <Card>
      <CardTitle
        action={
          onClose && (
            <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
              <X className="size-4" />
            </button>
          )
        }
      >
        Chọn bài tập
      </CardTitle>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input autoFocus={!!onClose} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm bài tập hoặc nhóm cơ" className="pl-9" />
      </div>
      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {(["all", ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm transition",
              cat === c ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-surface-2",
            )}
          >
            {c === "all" ? "Tất cả" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <ul className="mt-2 max-h-80 divide-y divide-border overflow-y-auto">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)} className="flex w-full items-center justify-between gap-2 px-1 py-2.5 text-left hover:bg-surface-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{e.name}</span>
                <span className="block text-xs text-muted">
                  {categoryLabel(e.category)}
                  {e.muscleGroup && ` · ${e.muscleGroup}`} · MET {num(e.met)}
                </span>
              </span>
              <Plus className="size-4 shrink-0 text-accent" />
            </button>
          </li>
        ))}
        {!list.length && <li className="py-6 text-center text-sm text-muted">Không tìm thấy bài tập.</li>}
      </ul>
    </Card>
  );
}
