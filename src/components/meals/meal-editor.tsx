"use client";

import { Camera, History, ImagePlus, Loader2, PenLine, Plus, Repeat, Search, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createMeal, discardPhoto, updateMeal, uploadMealPhoto } from "@/app/(app)/meals/actions";
import { Badge, Button, Card, CardTitle, cn, Field, Input, LinkButton, Textarea } from "@/components/ui";
import { downscaleImage } from "@/lib/client-image";
import { areDuplicateMealItems, hasDuplicateMealItems } from "@/lib/meals";
import {
  findFoodByName,
  FOOD_CATEGORY_LABEL,
  isZeroKcalName,
  matchPortion,
  normalize,
  nutritionFor,
  rankByName,
  searchFoods,
  type Food,
  type FoodPortion,
} from "@/lib/foods";
import { kcal as fmtKcal, num, parseNum } from "@/lib/format";
import {
  LOW_CONFIDENCE,
  MEAL_TYPES,
  mealTypeLabel,
  type MealInput,
  type MealItemInput,
  type MealType,
  type PreviousMeal,
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
  // Named portions ("1 tô", "1 ổ"…) when the name is a food from the database; portionIdx -1 = custom grams.
  portions: FoodPortion[] | null;
  portionIdx: number;
  qty: string;
}

let rowSeq = 0;
const str = (n: number | null | undefined) => (n == null ? "" : String(Math.round(n * 10) / 10));
const val = (s: string) => parseNum(s) ?? 0;

// A new row without values starts with empty fields rather than zeros, so typing doesn't append to "0".
function toRow(i: MealItemInput, blank = !i.name && !i.kcal): Row {
  const s = (n: number | null) => (blank ? "" : str(n));
  const food = i.name ? findFoodByName(i.name) : undefined;
  const match = food ? matchPortion(food.portions, i.portionG) : null;
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
    portions: food?.portions ?? null,
    portionIdx: match?.idx ?? -1,
    qty: str(match?.qty ?? 1),
  };
}

const emptyItem: MealItemInput = { name: "", portionG: null, kcal: 0, proteinG: 0, carbG: 0, fatG: 0, source: "manual", confidence: null };

/** A database food at its default portion. */
function foodItem(food: Food): MealItemInput {
  const grams = food.portions[0].g;
  return { name: food.name, portionG: grams, ...nutritionFor(food, grams), source: "manual", confidence: null };
}

function snapshot(r: Row): Row["base"] {
  const p = parseNum(r.portionG);
  return p && p > 0 ? { portionG: p, kcal: val(r.kcal), proteinG: val(r.proteinG), carbG: val(r.carbG), fatG: val(r.fatG) } : null;
}

/** Set the grams and rescale the macros from the row's base. */
function scaleTo(r: Row, grams: number, typed = str(grams)): Row {
  const next = { ...r, portionG: typed };
  if (r.base && grams > 0) {
    const k = grams / r.base.portionG;
    for (const m of MACROS) next[m] = str(r.base[m] * k);
  }
  return next;
}

// "1 tô · 550 g"; labels that already state the amount ("100 g", "1 lon 330 ml") stay as they are.
const portionText = (p: FoodPortion) => (/\d\s*(g|ml|L)\b/.test(p.label) ? p.label : `${p.label} · ${num(p.g, 0)} g`);

type SearchResult = { kind: "food"; food: Food; score: number } | { kind: "recent"; food: RecentFood; score: number };

export interface MealEditorProps {
  mode: "new" | "edit";
  mealId?: string;
  initial: { date: string; type: MealType; time: string; note: string; items: MealItemInput[] };
  existingPhotos?: { id: string; url: string }[];
  recentFoods: RecentFood[];
  /** The previous day's meals per type, offered as "Lặp lại bữa … hôm qua" (new meals only). */
  previousDay?: Partial<Record<MealType, PreviousMeal>>;
}

export function MealEditor({ mode, mealId, initial, existingPhotos = [], recentFoods, previousDay }: MealEditorProps) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => initial.items.map((i) => toRow(i)));
  const [date, setDate] = useState(initial.date);
  const [type, setType] = useState<MealType>(initial.type);
  const [time, setTime] = useState(initial.time);
  const [note, setNote] = useState(initial.note);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // A ref, not state: two taps in the same frame both see `saving === false`.
  const savingRef = useRef(false);
  // Row keys of items without kcal, waiting for "vẫn lưu?" confirmation.
  const [zeroAsk, setZeroAsk] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
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

  // The user's own recent foods (their real portions) come first when they match as well as a database food.
  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];
    const recent = rankByName(recentFoods, query, (f) => f.name)
      .slice(0, 3)
      .map((s): SearchResult => ({ kind: "recent", food: s.item, score: s.score + 5 }));
    const recentNames = new Set(recent.map((r) => normalize(r.food.name)));
    const foods = searchFoods(query, 8)
      .filter((s) => !recentNames.has(normalize(s.item.name)))
      .map((s): SearchResult => ({ kind: "food", food: s.item, score: s.score }));
    return [...recent, ...foods].sort((a, b) => b.score - a.score).slice(0, 8);
  }, [query, recentFoods]);

  const previous = mode === "new" ? previousDay?.[type] : undefined;

  function editRows(fn: (prev: Row[]) => Row[]) {
    setZeroAsk(null);
    setRows(fn);
  }

  async function pickFile(picked: File | undefined) {
    if (!picked) return;
    // A different picture replaces the one already uploaded.
    if (photo) void discardPhoto(photo.id);
    setPhoto(null);
    setError(null);
    // Shrunk in the browser so the upload stays under the host's request size limit.
    const f = await downscaleImage(picked);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function updateRow(key: string, field: keyof Row, value: string) {
    editRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        if (field === "portionG") {
          const p = parseNum(value);
          const next = p != null && p > 0 ? scaleTo(r, p, value) : { ...r, portionG: value };
          const match = r.portions ? matchPortion(r.portions, p) : null;
          return { ...next, portionIdx: match?.idx ?? -1, qty: match ? str(match.qty) : r.qty };
        }
        const next = { ...r, [field]: value };
        if (MACROS.includes(field as NumKey)) next.base = snapshot(next);
        return next;
      }),
    );
  }

  /** Pick a named portion (idx >= 0) or a quantity of it; -1 switches to custom grams. */
  function setPortion(key: string, idx: number, qty: string) {
    editRows((prev) =>
      prev.map((r) => {
        if (r.key !== key || !r.portions) return r;
        const next = { ...r, portionIdx: idx, qty };
        const q = parseNum(qty);
        if (idx < 0 || q == null || q <= 0) return next;
        return scaleTo(next, r.portions[idx].g * q);
      }),
    );
  }

  // Grams typed after the macros become the scaling base once the field is left, so the
  // next portion change rescales. Done on blur, not per keystroke, so "2" -> "20" -> "200" doesn't scale.
  function lockBase(key: string) {
    editRows((prev) => prev.map((r) => (r.key === key && !r.base ? { ...r, base: snapshot(r) } : r)));
  }

  function addRows(newRows: Row[]) {
    // Fill a blank row instead of leaving it dangling.
    const existing = rows.filter((r) => r.name.trim() || r.kcal.trim());
    const accepted: Row[] = [];
    let foundDuplicate = false;
    for (const row of newRows) {
      const duplicate = [...existing, ...accepted].some((candidate) =>
        candidate.name.trim() && row.name.trim() && areDuplicateMealItems(toMealItem(candidate), toMealItem(row)),
      );
      if (duplicate) foundDuplicate = true;
      else accepted.push(row);
    }
    editRows(() => [...existing, ...accepted]);
    if (foundDuplicate) setError("Món này đã có với cùng khẩu phần và số liệu. Tăng khẩu phần ở dòng hiện có nếu bạn ăn thêm.");
  }

  function toMealItem(row: Row) {
    return {
      name: row.name,
      portionG: parseNum(row.portionG),
      kcal: val(row.kcal),
      proteinG: val(row.proteinG),
      carbG: val(row.carbG),
      fatG: val(row.fatG),
    };
  }

  function pickResult(r: SearchResult) {
    addRows([toRow(r.kind === "food" ? foodItem(r.food) : { ...r.food, source: "manual", confidence: null })]);
    setQuery("");
    searchRef.current?.focus();
  }

  function addManual(name = "") {
    addRows([toRow({ ...emptyItem, name }, true)]);
    setQuery("");
  }

  function removeRow(key: string) {
    editRows((prev) => prev.filter((r) => r.key !== key));
  }

  function save(confirmedZero = false) {
    if (savingRef.current) return;
    setError(null);
    const filled = rows.filter((r) => r.name.trim() || val(r.kcal));
    const items: MealItemInput[] = filled.map((r) => ({
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
    if (hasDuplicateMealItems(items)) {
      setError("Có hai dòng món giống hệt nhau. Hãy gộp khẩu phần vào một dòng hoặc chỉnh lại số liệu.");
      return;
    }
    if (items.some((i) => [i.kcal, i.proteinG, i.carbG, i.fatG, i.portionG ?? 0].some((n) => n < 0))) {
      setError("Số liệu không được âm.");
      return;
    }
    if (!confirmedZero) {
      const missing = filled.filter((r) => !(val(r.kcal) > 0) && !isZeroKcalName(r.name)).map((r) => r.key);
      if (missing.length) {
        setZeroAsk(missing);
        return;
      }
    }
    setZeroAsk(null);
    savingRef.current = true;
    startSaving(async () => {
      // On success the action redirects and the lock stays held until the page goes away.
      const fail = (msg: string) => {
        setError(msg);
        savingRef.current = false;
      };
      try {
        // A photo that was picked but never sent for analysis is uploaded now rather than dropped.
        let photoId = photo?.id ?? null;
        if (file && !photo) {
          const fd = new FormData();
          fd.set("photo", file);
          fd.set("date", date);
          const up = await uploadMealPhoto(fd);
          if (!up.ok) return fail(up.error);
          photoId = up.photoId;
          setPhoto({ id: up.photoId, url: up.photoUrl });
        }
        const input: MealInput = { date, type, time, note, items, photoId };
        const res = mode === "edit" && mealId ? await updateMeal(mealId, input) : await createMeal(input);
        if (res?.error) fail(res.error);
      } catch (err) {
        console.error(err);
        fail("Không lưu được. Kiểm tra kết nối mạng rồi thử lại.");
      }
    });
  }

  async function cancel() {
    if (photo) await discardPhoto(photo.id);
    router.push(`/meals?date=${initial.date}`);
  }

  const busy = saving;
  const zeroNames = zeroAsk ? rows.filter((r) => zeroAsk.includes(r.key)).map((r) => r.name.trim() || "không tên") : [];

  const photoCard =
    mode === "new" ? (
      <Card>
        <CardTitle>Ảnh món ăn (không bắt buộc)</CardTitle>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
        <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />

        {preview ? (
          <div className="relative mb-3 overflow-hidden rounded-xl bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={preview} alt="Ảnh món ăn" className="mx-auto max-h-80 w-auto object-contain" />
          </div>
        ) : (
          <p className="mb-3 text-sm text-muted">
            Chụp hoặc chọn ảnh để lưu cùng bữa ăn. Để AI phân tích, tải ảnh lên chat Claude và yêu cầu lưu qua BodyMetrics connector.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => cameraRef.current?.click()} disabled={busy}>
            <Camera className="size-4" /> {preview ? "Chụp lại" : "Chụp ảnh"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => libraryRef.current?.click()} disabled={busy}>
            <ImagePlus className="size-4" /> Chọn ảnh
          </Button>
        </div>

        <div className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3 text-xs text-muted">
            <p className="flex gap-2">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span>
                Ảnh đang chọn không tự gửi sang Claude. Hãy tải ảnh lên trong chat, yêu cầu phân tích và lưu vào đúng hồ sơ bằng username BodyMetrics chính xác, ví dụ bm_demo_an. Ảnh được đính kèm vào bữa ăn này khi bạn nhấn Lưu bữa ăn.
              </span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <LinkButton
                href="https://claude.ai/new"
                target="_blank"
                rel="noreferrer"
                variant="secondary"
                className="w-full sm:w-auto"
              >
                Mở chat Claude
              </LinkButton>
              <Link href="/profile#ket-noi-claude" className="font-medium text-accent underline-offset-2 hover:underline">
                URL và trạng thái kết nối
              </Link>
            </div>
        </div>
      </Card>
    ) : (
      existingPhotos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {existingPhotos.map((p) => (
            <Image key={p.id} src={p.url} alt="Ảnh bữa ăn" width={320} height={240} unoptimized className="h-48 w-auto rounded-xl object-cover" />
          ))}
        </div>
      )
    );

  return (
    <div className="space-y-4">
      {photoCard}

      <Card>
        <CardTitle action={<span className="text-sm font-semibold tabular-nums text-intake">{fmtKcal(totals.kcal)} kcal</span>}>Món ăn</CardTitle>

        {previous && (
          <button
            type="button"
            onClick={() => addRows(previous.items.map((i) => toRow(i)))}
            className="mb-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-accent/50 bg-accent/5 p-3 text-left text-sm hover:bg-accent/10"
          >
            <Repeat className="size-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-accent">Lặp lại bữa {mealTypeLabel(type).toLowerCase()} hôm qua</span>
              <span className="block truncate text-xs text-muted">{previous.items.map((i) => i.name).join(", ")}</span>
            </span>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted">{fmtKcal(previous.kcal)} kcal</span>
          </button>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          {/* Not <Input>: cn() has no tailwind-merge, so its px-3 would fight the icon padding. */}
          <input
            ref={searchRef}
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (results[0]) pickResult(results[0]);
              }
            }}
            placeholder="Tìm món: phở, cơm tấm, trà sữa…"
            aria-label="Tìm món ăn"
            autoComplete="off"
            enterKeyHint="done"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pr-9 pl-9 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Xóa tìm kiếm"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1 text-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {query.trim() ? (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border" aria-label="Kết quả tìm món">
            {results.map((r) => {
              const grams = r.kind === "food" ? r.food.portions[0].g : r.food.portionG;
              const kcalValue = r.kind === "food" ? nutritionFor(r.food, grams ?? 100).kcal : r.food.kcal;
              return (
                <li key={`${r.kind}:${r.food.name}`}>
                  <button type="button" onClick={() => pickResult(r)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.food.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.kind === "food" ? (
                          <>
                            {portionText(r.food.portions[0])} · {FOOD_CATEGORY_LABEL[r.food.category]}
                          </>
                        ) : (
                          <>
                            <History className="mr-1 inline size-3 align-[-2px]" />
                            Lần trước{grams ? ` · ${num(grams, 0)} g` : ""}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-intake">{fmtKcal(kcalValue)}</span>
                    <Plus className="size-4 shrink-0 text-accent" />
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => addManual(query.trim())} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-muted hover:bg-surface-2">
                <PenLine className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {results.length ? "Không thấy? " : "Không tìm thấy. "}Nhập tay “{query.trim()}”
                </span>
              </button>
            </li>
          </ul>
        ) : (
          recentFoods.length > 0 && (
            <div className="mt-2">
              <span className="mb-1.5 block text-xs text-muted">Hay ăn gần đây</span>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {recentFoods.slice(0, 12).map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => addRows([toRow({ ...f, source: "manual", confidence: null })])}
                    className="shrink-0 rounded-full border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent"
                  >
                    {f.name} <span className="text-muted">· {fmtKcal(f.kcal)}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {rows.length > 0 && (
          <div className="mt-4 mb-1 hidden gap-2 px-1 text-xs text-muted md:flex">
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
        )}

        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
            Chưa có món nào. Tìm món ở trên, hoặc nhập tay nếu không có trong danh sách.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 md:mt-0">
            {rows.map((r) => {
              const low = r.source === "ai" && r.confidence != null && r.confidence < LOW_CONFIDENCE;
              const noKcal = zeroAsk?.includes(r.key);
              return (
                <li
                  key={r.key}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border p-2 md:flex-row md:items-start md:border-transparent md:p-1",
                    noKcal ? "border-danger/60 bg-danger/5 md:border-danger/60" : low ? "border-intake/50 bg-intake/5 md:border-intake/50" : "border-border",
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
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
                    {r.portions && (
                      <div className="flex items-center gap-1.5">
                        {r.portionIdx >= 0 && (
                          <>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={r.qty}
                              onChange={(e) => setPortion(r.key, r.portionIdx, e.target.value)}
                              aria-label="Số phần"
                              className="w-12 shrink-0 rounded-xl border border-border bg-surface px-1.5 py-1.5 text-center text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                            />
                            <span className="text-xs text-muted">×</span>
                          </>
                        )}
                        <select
                          value={r.portionIdx}
                          onChange={(e) => setPortion(r.key, Number(e.target.value), r.portionIdx >= 0 ? r.qty : "1")}
                          aria-label="Khẩu phần"
                          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                        >
                          {r.portions.map((p, idx) => (
                            <option key={p.label} value={idx}>
                              {portionText(p)}
                            </option>
                          ))}
                          <option value={-1}>Tự nhập số gram</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 md:w-[26rem] md:gap-2">
                    <NumInput label="Gram" value={r.portionG} onChange={(v) => updateRow(r.key, "portionG", v)} onBlur={() => lockBase(r.key)} />
                    <NumInput label="Kcal" value={r.kcal} onChange={(v) => updateRow(r.key, "kcal", v)} invalid={noKcal} />
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
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="secondary" onClick={() => addManual()}>
            <PenLine className="size-4" /> Nhập tay
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
        {rows.length > 0 && <p className="mt-2 text-xs text-muted">Đổi khẩu phần hoặc số gram sẽ tự tính lại calo và chất theo tỉ lệ.</p>}
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

      {zeroAsk && (
        <div role="alertdialog" aria-label="Món chưa có calo" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <span>
              Món <strong>{zeroNames.join(", ")}</strong> chưa có calo - vẫn lưu?
            </span>
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => save(true)} disabled={busy}>
              Vẫn lưu
            </Button>
            <Button type="button" variant="ghost" onClick={() => setZeroAsk(null)}>
              Để nhập calo
            </Button>
          </div>
        </div>
      )}

      {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" onClick={() => save()} disabled={busy} className="flex-1 sm:flex-none">
          {saving && <Loader2 className="size-4 animate-spin" />} {mode === "edit" ? "Lưu thay đổi" : "Lưu bữa ăn"}
        </Button>
        <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
          Hủy
        </Button>
      </div>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  onBlur,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block text-[11px] text-muted md:hidden">{label}</span>
      {/* Not <Input>: its horizontal padding leaves too little room for "27.5" in five columns at 375px. */}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full rounded-xl border bg-surface px-1.5 py-2 text-right text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
          invalid ? "border-danger" : "border-border",
        )}
      />
    </label>
  );
}
