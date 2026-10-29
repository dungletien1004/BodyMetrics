"use client";

import { Camera, ImagePlus, Loader2, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { analyzePhoto, createMeal, discardPhoto, updateMeal } from "@/app/meals/actions";
import { Badge, Button, Card, CardTitle, cn, Field, Input, Textarea } from "@/components/ui";
import { kcal as fmtKcal, num, parseNum } from "@/lib/format";
import {
  LOW_CONFIDENCE,
  MEAL_TYPES,
  type MealInput,
  type MealItemInput,
  type MealType,
  type RecentFood,
} from "./types";

type NumKey = "portionG" | "kcal" | "proteinG" | "carbG" | "fatG";
const MACROS: NumKey[] = ["kcal", "proteinG", "carbG", "fatG"];

interface Row {
  key: string;
  name: string;
  portionG: string;
  kcal: string;
  proteinG: string;
  carbG: string;
  fatG: string;
  source: "ai" | "manual";
  confidence: number | null;
  // Values that portion changes scale from; reset whenever a macro is typed by hand.
  base: Record<NumKey, number> | null;
}

let rowSeq = 0;
const str = (n: number | null | undefined) => (n == null ? "" : String(Math.round(n * 10) / 10));
const val = (s: string) => parseNum(s) ?? 0;

function toRow(i: MealItemInput): Row {
  // A brand-new blank row starts with empty fields rather than zeros, so typing doesn't append to "0".
  const blank = !i.name && !i.kcal;
  const s = (n: number | null) => (blank ? "" : str(n));
  return {
    key: `r${++rowSeq}`,
    name: i.name,
    portionG: s(i.portionG),
    kcal: s(i.kcal),
    proteinG: s(i.proteinG),
    carbG: s(i.carbG),
    fatG: s(i.fatG),
    source: i.source,
    confidence: i.confidence,
    base: i.portionG ? { portionG: i.portionG, kcal: i.kcal, proteinG: i.proteinG, carbG: i.carbG, fatG: i.fatG } : null,
  };
}

const emptyItem: MealItemInput = { name: "", portionG: null, kcal: 0, proteinG: 0, carbG: 0, fatG: 0, source: "manual", confidence: null };

function snapshot(r: Row): Row["base"] {
  const p = parseNum(r.portionG);
  return p && p > 0 ? { portionG: p, kcal: val(r.kcal), proteinG: val(r.proteinG), carbG: val(r.carbG), fatG: val(r.fatG) } : null;
}

export interface MealEditorProps {
  mode: "new" | "edit";
  mealId?: string;
  initial: { date: string; type: MealType; time: string; note: string; items: MealItemInput[] };
  existingPhotos?: { id: string; url: string }[];
  recentFoods: RecentFood[];
  aiEnabled: boolean;
}

export function MealEditor({ mode, mealId, initial, existingPhotos = [], recentFoods, aiEnabled }: MealEditorProps) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => (initial.items.length ? initial.items : [emptyItem]).map(toRow));
  const [date, setDate] = useState(initial.date);
  const [type, setType] = useState<MealType>(initial.type);
  const [time, setTime] = useState(initial.time);
  const [note, setNote] = useState(initial.note);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [aiRaw, setAiRaw] = useState<string | null>(null);
  const [aiNotes, setAiNotes] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [query, setQuery] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({ kcal: t.kcal + val(r.kcal), proteinG: t.proteinG + val(r.proteinG), carbG: t.carbG + val(r.carbG), fatG: t.fatG + val(r.fatG) }),
        { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
      ),
    [rows],
  );

  const recent = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? recentFoods.filter((f) => f.name.toLowerCase().includes(q)) : recentFoods).slice(0, 12);
  }, [query, recentFoods]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    // A different picture replaces the one already uploaded.
    if (photo) void discardPhoto(photo.id);
    setPhoto(null);
    setAiRaw(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setWarning(null);
    setError(null);
  }

  async function runAnalysis() {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    setWarning(null);
    try {
      const fd = new FormData();
      fd.set("photo", file);
      fd.set("hint", hint);
      fd.set("date", date);
      const res = await analyzePhoto(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // A re-analysis replaces the previous upload.
      if (photo && photo.id !== res.photoId) void discardPhoto(photo.id);
      setPhoto({ id: res.photoId, url: res.photoUrl });
      setAiRaw(res.aiRaw);
      setAiNotes(res.notes);
      setWarning(res.warning);
      setRows((prev) => {
        const kept = prev.filter((r) => r.source === "manual" && r.name.trim());
        const next = [...res.items.map(toRow), ...kept];
        return next.length ? next : [toRow(emptyItem)];
      });
    } catch (err) {
      console.error(err);
      setError("Không gửi được ảnh. Ảnh có thể quá lớn (tối đa 20 MB) hoặc máy chủ không phản hồi.");
    } finally {
      setAnalyzing(false);
    }
  }

  function updateRow(key: string, field: keyof Row, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, [field]: value };
        if (field === "portionG") {
          const p = parseNum(value);
          if (r.base && p != null && p > 0) {
            const k = p / r.base.portionG;
            for (const m of MACROS) next[m] = str(r.base[m] * k);
          }
        } else if (MACROS.includes(field as NumKey)) {
          next.base = snapshot(next);
        }
        return next;
      }),
    );
  }

  function addRow(item: MealItemInput = emptyItem) {
    setRows((prev) => {
      // Fill a blank first row instead of leaving it dangling.
      const blank = prev.length === 1 && !prev[0].name.trim() && !val(prev[0].kcal);
      return [...(blank ? [] : prev), toRow(item)];
    });
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : [toRow(emptyItem)]));
  }

  function save() {
    setError(null);
    const items: MealItemInput[] = rows
      .filter((r) => r.name.trim() || val(r.kcal))
      .map((r) => ({
        name: r.name.trim() || "Món không tên",
        portionG: parseNum(r.portionG),
        kcal: val(r.kcal),
        proteinG: val(r.proteinG),
        carbG: val(r.carbG),
        fatG: val(r.fatG),
        source: r.source,
        confidence: r.confidence,
      }));
    if (!items.length) {
      setError("Thêm ít nhất một món ăn.");
      return;
    }
    if (items.some((i) => [i.kcal, i.proteinG, i.carbG, i.fatG, i.portionG ?? 0].some((n) => n < 0))) {
      setError("Số liệu không được âm.");
      return;
    }
    const input: MealInput = { date, type, time, note, items, photoId: photo?.id ?? null, aiRaw };
    startSaving(async () => {
      const res = mode === "edit" && mealId ? await updateMeal(mealId, input) : await createMeal(input);
      if (res?.error) setError(res.error);
    });
  }

  async function cancel() {
    if (photo) await discardPhoto(photo.id);
    router.push(`/meals?date=${initial.date}`);
  }

  const busy = analyzing || saving;

  return (
    <div className="space-y-4">
      {mode === "new" ? (
        <Card>
          <CardTitle>Ảnh món ăn</CardTitle>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />

          {preview ? (
            <div className="relative mb-3 overflow-hidden rounded-xl bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={preview} alt="Ảnh món ăn" className="mx-auto max-h-80 w-auto object-contain" />
              {analyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-sm text-white">
                  <Loader2 className="size-6 animate-spin" /> Đang phân tích…
                </div>
              )}
            </div>
          ) : (
            <p className="mb-3 text-sm text-muted">
              Chụp hoặc chọn ảnh bữa ăn{aiEnabled ? ", AI sẽ ước lượng món, khẩu phần và calo." : "."} Có thể bỏ qua và nhập tay bên dưới.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={preview ? "secondary" : "primary"} onClick={() => cameraRef.current?.click()} disabled={busy}>
              <Camera className="size-4" /> {preview ? "Chụp lại" : "Chụp ảnh"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => libraryRef.current?.click()} disabled={busy}>
              <ImagePlus className="size-4" /> Chọn ảnh
            </Button>
          </div>

          {file && (
            <div className="mt-3 space-y-3">
              <Field label="Mô tả thêm (không bắt buộc)" hint="Giúp AI đoán đúng hơn: tên món, lượng đã ăn, cách nấu.">
                <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="VD: cơm tấm sườn, ít cơm" maxLength={300} />
              </Field>
              {(aiEnabled || !photo) && (
                <Button type="button" onClick={runAnalysis} disabled={busy} className="w-full sm:w-auto">
                  {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {aiEnabled ? (photo ? "Phân tích lại" : "Phân tích") : "Tải ảnh lên"}
                </Button>
              )}
              {!aiEnabled && !photo && <p className="text-xs text-muted">Chưa có ANTHROPIC_API_KEY: ảnh chỉ được lưu, bạn nhập món bằng tay.</p>}
            </div>
          )}
        </Card>
      ) : (
        existingPhotos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {existingPhotos.map((p) => (
              <Image key={p.id} src={p.url} alt="Ảnh bữa ăn" width={320} height={240} unoptimized className="h-48 w-auto rounded-xl object-cover" />
            ))}
          </div>
        )
      )}

      {warning && (
        <div className="flex gap-2 rounded-xl border border-intake/40 bg-intake/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-intake" />
          <span>{warning}</span>
        </div>
      )}

      <Card>
        <CardTitle action={<span className="text-sm font-semibold tabular-nums text-intake">{fmtKcal(totals.kcal)} kcal</span>}>Món ăn</CardTitle>

        {aiNotes && <p className="mb-3 whitespace-pre-line rounded-xl bg-surface-2 p-3 text-xs text-muted">{aiNotes}</p>}

        <div className="mb-1 hidden gap-2 px-1 text-xs text-muted md:flex">
          <span className="flex-1">Tên món</span>
          <span className="grid w-[26rem] grid-cols-5 gap-2 text-right">
            <span>Gram</span>
            <span>Kcal</span>
            <span>Đạm</span>
            <span>Tinh bột</span>
            <span>Béo</span>
          </span>
          <span className="w-9" />
        </div>

        <ul className="space-y-2">
          {rows.map((r) => {
            const low = r.source === "ai" && r.confidence != null && r.confidence < LOW_CONFIDENCE;
            return (
              <li
                key={r.key}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-2 md:flex-row md:items-center md:border-transparent md:p-1",
                  low ? "border-intake/50 bg-intake/5 md:border-intake/50" : "border-border",
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Input value={r.name} onChange={(e) => updateRow(r.key, "name", e.target.value)} placeholder="Tên món" aria-label="Tên món" />
                  {r.source === "ai" && r.confidence != null && (
                    <Badge className={cn("shrink-0", low && "bg-intake/15 text-intake")}>
                      {low ? "Chưa chắc " : "AI "}
                      {Math.round(r.confidence * 100)}%
                    </Badge>
                  )}
                  <button type="button" onClick={() => removeRow(r.key)} aria-label="Xóa món" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger md:hidden">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1.5 md:w-[26rem] md:gap-2">
                  <NumInput label="Gram" value={r.portionG} onChange={(v) => updateRow(r.key, "portionG", v)} />
                  <NumInput label="Kcal" value={r.kcal} onChange={(v) => updateRow(r.key, "kcal", v)} />
                  <NumInput label="Đạm" value={r.proteinG} onChange={(v) => updateRow(r.key, "proteinG", v)} />
                  <NumInput label="T.bột" value={r.carbG} onChange={(v) => updateRow(r.key, "carbG", v)} />
                  <NumInput label="Béo" value={r.fatG} onChange={(v) => updateRow(r.key, "fatG", v)} />
                </div>
                <button type="button" onClick={() => removeRow(r.key)} aria-label="Xóa món" className="hidden rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger md:block">
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="secondary" onClick={() => addRow()}>
            <Plus className="size-4" /> Thêm món
          </Button>
          <div className="flex gap-3 text-xs tabular-nums text-muted">
            <span>
              <span className="mr-1 inline-block size-2 rounded-full bg-protein" />
              Đạm {num(totals.proteinG, 0)} g
            </span>
            <span>
              <span className="mr-1 inline-block size-2 rounded-full bg-carb" />
              Tinh bột {num(totals.carbG, 0)} g
            </span>
            <span>
              <span className="mr-1 inline-block size-2 rounded-full bg-fat" />
              Béo {num(totals.fatG, 0)} g
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">Đổi số gram sẽ tự tính lại calo và chất theo tỉ lệ.</p>

        {recentFoods.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Thêm nhanh</span>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm…" className="max-w-40 py-1" aria-label="Tìm món đã ăn" />
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => addRow({ ...f, source: "manual", confidence: null })}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent"
                >
                  {f.name} <span className="text-muted">· {fmtKcal(f.kcal)}</span>
                </button>
              ))}
              {recent.length === 0 && <span className="text-xs text-muted">Không có món phù hợp.</span>}
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium">Bữa</span>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
            {MEAL_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn("rounded-lg py-1.5 text-sm", type === t.value ? "bg-surface font-medium text-accent shadow-sm" : "text-muted")}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày">
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Giờ">
            <Input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Ghi chú">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ăn ở đâu, cảm giác no…" maxLength={1000} />
        </Field>
      </Card>

      {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={busy} className="flex-1 sm:flex-none">
          {saving && <Loader2 className="size-4 animate-spin" />} {mode === "edit" ? "Lưu thay đổi" : "Lưu bữa ăn"}
        </Button>
        <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
          Hủy
        </Button>
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block text-[11px] text-muted md:hidden">{label}</span>
      {/* Not <Input>: its horizontal padding leaves too little room for "27.5" in five columns at 375px. */}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full rounded-xl border border-border bg-surface px-1.5 py-2 text-right text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}
