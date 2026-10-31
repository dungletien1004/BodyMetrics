"use client";

import { Check, ChevronDown, Copy, Minus, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveWorkout, weightForDay } from "@/app/(app)/workouts/actions";
import { Badge, Button, Card, CardTitle, Field, LinkButton, cn } from "@/components/ui";
import { exerciseKcal, INTENSITY_LABEL, type Intensity } from "@/lib/calc";
import { formatDayLong, formatDayShort, isDayKey } from "@/lib/dates";
import { kcal, num, parseNum } from "@/lib/format";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  DEFAULT_CARDIO_MINUTES,
  INTENSITIES,
  MINUTES_PER_SET,
  categoryLabel,
  setsSummary,
  setsVolume,
  stepValue,
  type Category,
  type ExerciseHabit,
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
  prefilledFrom?: string; // day of the previous entry the sets were copied from
}

let seq = 0;
const uid = () => `r${++seq}`;
const str = (n: number | null | undefined) => (n == null ? "" : String(n));

const KG_STEP = 2.5;
// Keeps a focused field clear of the sticky save bar (and the mobile nav under it).
const CLEAR_OF_BAR = "scroll-mb-44 md:scroll-mb-28";
// Like ui.tsx fields but 16px on phones, so iOS does not zoom in on focus.
const FIELD = cn(
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm",
  CLEAR_OF_BAR,
);

function newSet(reps = "", kg = ""): SetRow {
  return { key: uid(), reps, kg };
}

/** A new entry, prefilled from the last time this user did the exercise. */
function newEntry(ex: ExerciseOption, last?: ExerciseHabit): EntryRow {
  const strength = ex.category === "strength";
  const lastSets = last?.sets.filter((s) => s.reps != null || s.weightKg != null) ?? [];
  const sets = !strength ? [] : lastSets.length ? lastSets.map((s) => newSet(str(s.reps), str(s.weightKg))) : [newSet(), newSet(), newSet()];
  return {
    key: uid(),
    exerciseId: ex.id,
    minutes: String(strength ? sets.length * MINUTES_PER_SET : (last?.durationMin ?? DEFAULT_CARDIO_MINUTES)),
    minutesAuto: strength,
    intensity: last?.intensity ?? "moderate",
    distance: "",
    sets,
    prefilledFrom: last && (strength ? lastSets.length > 0 : true) ? last.lastDate : undefined,
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

/** Server-action redirects surface as an error with a NEXT_REDIRECT digest; let them through. */
const isRedirect = (err: unknown) =>
  typeof err === "object" && err != null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");

export function WorkoutBuilder({
  exercises,
  habits,
  initial,
  initialWeightKg,
  workoutId = null,
}: {
  exercises: ExerciseOption[];
  habits: ExerciseHabit[];
  initial: WorkoutPayload;
  initialWeightKg: number;
  workoutId?: string | null;
}) {
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const habitById = useMemo(() => new Map(habits.map((h) => [h.exerciseId, h])), [habits]);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [duration, setDuration] = useState(str(initial.durationMin));
  const [override, setOverride] = useState(str(initial.kcalOverride));
  const [note, setNote] = useState(initial.note);
  const [optionsOpen, setOptionsOpen] = useState(initial.durationMin != null || initial.kcalOverride != null || initial.note.trim() !== "");
  const [entries, setEntries] = useState<EntryRow[]>(() => rowsFromPayload(initial));
  const [weight, setWeight] = useState(initialWeightKg);
  const [pickerOpen, setPickerOpen] = useState(initial.entries.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // A ref, not state: two taps in the same frame both see busy=false in a state value.
  const lock = useRef(false);
  const [locked, setLocked] = useState(false);
  const scrollTo = useRef<string | null>(null);

  useEffect(() => {
    if (!scrollTo.current) return;
    document.getElementById(`entry-${scrollTo.current}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    scrollTo.current = null;
  }, [entries]);


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
  const busy = saving || locked;

  function update(key: string, fn: (e: EntryRow) => EntryRow) {
    setEntries((list) => list.map((e) => (e.key === key ? fn(e) : e)));
  }

  function updateSets(key: string, fn: (sets: SetRow[]) => SetRow[]) {
    update(key, (e) => {
      const sets = fn(e.sets);
      return { ...e, sets, minutes: e.minutesAuto ? String(Math.max(1, sets.length) * MINUTES_PER_SET) : e.minutes };
    });
  }

  function addExercise(ex: ExerciseOption) {
    const entry = newEntry(ex, habitById.get(ex.id));
    scrollTo.current = entry.key;
    setEntries((list) => [...list, entry]);
    setPickerOpen(false);
    setError(null);
  }

  function changeDate(v: string) {
    setDate(v);
    if (isDayKey(v)) weightForDay(v).then((w) => w != null && setWeight(w));
  }

  function submit() {
    if (lock.current) return;
    setError(null);
    if (!entries.length) return setError("Thêm ít nhất một bài tập.");
    if (!isDayKey(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
      setOptionsOpen(true);
      return setError("Kiểm tra lại ngày và giờ bắt đầu trong Tùy chọn.");
    }
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
    lock.current = true;
    setLocked(true);
    const unlock = () => {
      lock.current = false;
      setLocked(false);
    };
    // On success the action redirects to the workout, so the lock stays on until the page changes.
    startSaving(async () => {
      try {
        const res = await saveWorkout(workoutId, payload);
        if (res?.error) {
          setError(res.error);
          unlock();
        }
      } catch (err) {
        if (isRedirect(err)) throw err;
        setError("Không lưu được - kiểm tra kết nối rồi thử lại.");
        unlock();
      }
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        submit();
      }}
      // Enter / "Go" on a phone keyboard must not save half-entered sets.
      onKeyDown={(ev) => {
        if (ev.key === "Enter" && ev.target instanceof HTMLInputElement) ev.preventDefault();
      }}
    >
      <Card>
        <CardTitle>Phân tích buổi tập bằng Claude</CardTitle>
        <div className="space-y-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          <p>
            Trong chat Claude, bật BodyMetrics connector, tải ảnh máy tập/đồng hồ/ghi chú lên rồi yêu cầu ghi buổi tập vào đúng username BodyMetrics, ví dụ bm_demo_an. Bạn cũng có thể nhập set và phút trực tiếp ở biểu mẫu bên dưới.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <LinkButton href="https://claude.ai/new" target="_blank" rel="noreferrer" variant="secondary" className="w-full sm:w-auto">
              Mở chat Claude
            </LinkButton>
            <Link href="/profile#ket-noi-claude" className="font-medium text-accent underline-offset-2 hover:underline">
              URL và trạng thái kết nối
            </Link>
          </div>
        </div>
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
            last={habitById.get(ex.id)}
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
          habits={habits}
          habitById={habitById}
          addedIds={new Set(entries.map((e) => e.exerciseId))}
          onPick={addExercise}
          onClose={entries.length ? () => setPickerOpen(false) : undefined}
        />
      ) : (
        <Button type="button" variant="secondary" className="w-full py-3" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" /> Thêm bài tập
        </Button>
      )}

      <section className="rounded-2xl border border-border bg-surface">
        <button
          type="button"
          aria-expanded={optionsOpen}
          aria-controls="workout-options"
          onClick={() => setOptionsOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left hover:bg-surface-2 sm:px-5"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">Tùy chọn</span>
            <span className="block truncate text-xs text-muted">
              {isDayKey(date) ? formatDayLong(date) : "Chưa chọn ngày"} · {startTime || "--:--"}
              {overrideKcal != null && ` · đồng hồ ${kcal(overrideKcal)} kcal`}
              {note.trim() && " · có ghi chú"}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted transition", optionsOpen && "rotate-180")} />
        </button>
        {optionsOpen && (
          <div id="workout-options" className="space-y-3 border-t border-border px-4 pt-3 pb-4 sm:px-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Ngày">
                <input type="date" required value={date} onChange={(e) => changeDate(e.target.value)} className={FIELD} />
              </Field>
              <Field label="Giờ bắt đầu">
                <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={FIELD} />
              </Field>
              <Field label="Tổng thời gian (phút)" hint="Để trống = tổng phút tập" className="col-span-2 sm:col-span-1">
                <input
                  inputMode="numeric"
                  value={duration}
                  placeholder={String(Math.round(totalMinutes))}
                  onChange={(e) => setDuration(e.target.value)}
                  className={FIELD}
                />
              </Field>
              <Field
                label="Calo từ đồng hồ thông minh"
                hint={`Thay cho ước tính MET (tính với ${num(weight)} kg)`}
                className="col-span-2 sm:col-span-1"
              >
                <input inputMode="numeric" value={override} placeholder="kcal" onChange={(e) => setOverride(e.target.value)} className={FIELD} />
              </Field>
            </div>
            <Field label="Ghi chú">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Cảm giác, giấc ngủ, chấn thương…"
                className={cn(
                  "min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm",
                  CLEAR_OF_BAR,
                )}
              />
            </Field>
          </div>
        )}
      </section>

      {/* Last child of the form: sticky never covers the content above it once you scroll to the end. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 md:bottom-4">
        <div className="rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
          {error && (
            <p role="alert" className="mb-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg leading-tight font-semibold tabular-nums text-burn">
                {kcal(overrideKcal ?? estimate)} kcal
                {overrideKcal != null && <span className="ml-1.5 text-sm font-normal text-muted line-through">{kcal(estimate)}</span>}
              </div>
              <div className="truncate text-xs text-muted tabular-nums">
                {Math.round(parseNum(duration) ?? totalMinutes)} phút · {entries.length} bài
                {volume > 0 && ` · ${num(volume, 0)} kg tạ`}
              </div>
            </div>
            <Button type="submit" disabled={busy || !entries.length} className="shrink-0 px-5 py-3">
              {busy ? "Đang lưu…" : "Lưu buổi tập"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

/** Number field with large -/+ buttons for one-thumb entry. */
function Stepper({
  label,
  value,
  step,
  decimal = false,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  step: number;
  decimal?: boolean;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const btn = "grid w-9 shrink-0 place-items-center text-muted transition hover:bg-surface-2 active:bg-surface-2 active:text-foreground";
  return (
    <div className="flex h-11 min-w-0 items-stretch overflow-hidden rounded-xl border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <button type="button" tabIndex={-1} aria-label={`Giảm ${label}`} onClick={() => onChange(stepValue(value, -step))} className={btn}>
        <Minus className="size-4" />
      </button>
      <input
        inputMode={decimal ? "decimal" : "numeric"}
        enterKeyHint="next"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        className={cn("w-full min-w-0 bg-transparent text-center text-base tabular-nums outline-none placeholder:text-muted/70", CLEAR_OF_BAR)}
      />
      <button type="button" tabIndex={-1} aria-label={`Tăng ${label}`} onClick={() => onChange(stepValue(value, step))} className={btn}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function EntryCard({
  index,
  entry: e,
  exercise: ex,
  last,
  kcalValue,
  onChange,
  onSets,
  onRemove,
}: {
  index: number;
  entry: EntryRow;
  exercise: ExerciseOption;
  last?: ExerciseHabit;
  kcalValue: number;
  onChange: (fn: (e: EntryRow) => EntryRow) => void;
  onSets: (fn: (sets: SetRow[]) => SetRow[]) => void;
  onRemove: () => void;
}) {
  const strength = ex.category === "strength";
  const setSet = (key: string, patch: Partial<SetRow>) => onSets((sets) => sets.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  return (
    <Card id={`entry-${e.key}`} className="scroll-mt-20 space-y-3">
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
          {e.prefilledFrom && <p className="mt-1.5 text-xs text-muted">Điền sẵn theo lần tập {formatDayShort(e.prefilledFrom)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-sm font-semibold tabular-nums text-burn">{kcal(kcalValue)} kcal</span>
          <button type="button" onClick={onRemove} aria-label="Xoá bài tập" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {strength && (
        <div className="sm:max-w-lg">
          <div className="grid grid-cols-[1.25rem_1fr_1fr_2rem] gap-1.5 pb-1 text-xs text-muted">
            <span />
            <span className="text-center">Số lần</span>
            <span className="text-center">Tạ (kg)</span>
            <span />
          </div>
          <div className="space-y-2">
            {e.sets.map((s, j) => (
              <div key={s.key} className="grid grid-cols-[1.25rem_1fr_1fr_2rem] items-center gap-1.5">
                <span className="text-center text-sm text-muted tabular-nums">{j + 1}</span>
                <Stepper label={`số lần set ${j + 1}`} value={s.reps} step={1} onChange={(v) => setSet(s.key, { reps: v })} />
                <Stepper label={`tạ set ${j + 1}`} value={s.kg} step={KG_STEP} decimal placeholder="–" onChange={(v) => setSet(s.key, { kg: v })} />
                <button
                  type="button"
                  aria-label={`Xoá set ${j + 1}`}
                  onClick={() => onSets((sets) => sets.filter((x) => x.key !== s.key))}
                  className="grid h-11 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" className="px-2 py-2.5" onClick={() => onSets((sets) => [...sets, newSet()])}>
              <Plus className="size-4" /> Thêm set
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-2 py-2.5"
              disabled={!e.sets.length}
              onClick={() =>
                onSets((sets) => {
                  const lastSet = sets[sets.length - 1];
                  return lastSet ? [...sets, newSet(lastSet.reps, lastSet.kg)] : sets;
                })
              }
            >
              <Copy className="size-4" /> Lặp set cuối
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-sm font-medium">{strength ? "Phút tập thực tế" : "Thời gian (phút)"}</span>
          <Stepper
            label="số phút"
            value={e.minutes}
            step={5}
            decimal
            onChange={(v) => onChange((x) => ({ ...x, minutes: v, minutesAuto: false }))}
          />
          {strength && e.minutesAuto && <span className="block text-xs text-muted">Ước tính {MINUTES_PER_SET} phút/set</span>}
        </div>
        {!strength && (
          <Field label="Quãng đường (km)">
            <input
              inputMode="decimal"
              value={e.distance}
              placeholder={last?.distanceKm != null ? `Lần trước ${num(last.distanceKm)}` : "Tuỳ chọn"}
              onChange={(ev) => onChange((x) => ({ ...x, distance: ev.target.value }))}
              className={FIELD}
            />
          </Field>
        )}
        <div className={cn("space-y-1", !strength && "col-span-2")}>
          <span className="text-sm font-medium">Cường độ</span>
          <div className="grid h-11 grid-cols-3 gap-1 rounded-xl border border-border p-1">
            {INTENSITIES.map((it) => (
              <button
                key={it}
                type="button"
                aria-pressed={e.intensity === it}
                onClick={() => onChange((x) => ({ ...x, intensity: it }))}
                className={cn("rounded-lg text-sm transition", e.intensity === it ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2")}
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

type PickerFilter = Category | "all" | "recent";

const RECENT_LIMIT = 12;

function lastTimeText(h: ExerciseHabit): string {
  const sets = setsSummary(h.sets);
  return `Lần trước ${formatDayShort(h.lastDate)}: ${sets || `${num(h.durationMin, 0)} phút`}`;
}

function ExercisePicker({
  exercises,
  habits,
  habitById,
  addedIds,
  onPick,
  onClose,
}: {
  exercises: ExerciseOption[];
  habits: ExerciseHabit[];
  habitById: Map<string, ExerciseHabit>;
  addedIds: Set<string>;
  onPick: (ex: ExerciseOption) => void;
  onClose?: () => void;
}) {
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const recent = useMemo(
    () =>
      habits
        .map((h) => byId.get(h.exerciseId))
        .filter((e): e is ExerciseOption => e != null)
        .slice(0, RECENT_LIMIT),
    [habits, byId],
  );
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<PickerFilter>(recent.length ? "recent" : "all");
  const needle = q.trim().toLowerCase();
  const matches = (e: ExerciseOption) => !needle || e.name.toLowerCase().includes(needle) || !!e.muscleGroup?.toLowerCase().includes(needle);
  // Typing searches the whole library; "Hay tập" is only a shortlist.
  const list =
    filter === "recent" && !needle
      ? recent
      : exercises.filter((e) => (filter === "all" || filter === "recent" || e.category === filter) && matches(e));
  const chips: { value: PickerFilter; label: string }[] = [
    ...(recent.length ? [{ value: "recent" as const, label: "Hay tập" }] : []),
    { value: "all", label: "Tất cả" },
    ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
  ];

  return (
    <Card>
      <CardTitle
        action={
          onClose && (
            <button type="button" onClick={onClose} aria-label="Đóng" className="-m-1.5 rounded-lg p-2 text-muted hover:bg-surface-2">
              <X className="size-4" />
            </button>
          )
        }
      >
        Chọn bài tập
      </CardTitle>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          enterKeyHint="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm bài tập hoặc nhóm cơ"
          aria-label="Tìm bài tập"
          className="h-11 w-full rounded-xl border border-border bg-surface pr-3 pl-9 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm"
        />
      </div>
      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {chips.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={filter === c.value}
            onClick={() => setFilter(c.value)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition",
              filter === c.value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-surface-2",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ul className="mt-2 max-h-[min(26rem,55dvh)] divide-y divide-border overflow-y-auto overscroll-contain">
        {list.map((e) => {
          const h = habitById.get(e.id);
          const added = addedIds.has(e.id);
          return (
            <li key={e.id}>
              <button type="button" onClick={() => onPick(e)} className="flex w-full items-center justify-between gap-2 px-1 py-3 text-left hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{e.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {h ? (
                      lastTimeText(h)
                    ) : (
                      <>
                        {categoryLabel(e.category)}
                        {e.muscleGroup && ` · ${e.muscleGroup}`} · MET {num(e.met)}
                      </>
                    )}
                  </span>
                </span>
                {added ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-accent">
                    <Check className="size-4" /> Đã thêm
                  </span>
                ) : (
                  <Plus className="size-5 shrink-0 text-accent" />
                )}
              </button>
            </li>
          );
        })}
        {!list.length && <li className="py-6 text-center text-sm text-muted">Không tìm thấy bài tập.</li>}
      </ul>
    </Card>
  );
}
