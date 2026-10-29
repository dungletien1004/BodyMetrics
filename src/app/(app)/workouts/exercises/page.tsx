import { ArrowLeft, Check, Plus, Search } from "lucide-react";
import Link from "next/link";
import { cn, EmptyState, Input, PageHeader } from "@/components/ui";
import { AddExerciseForm } from "@/components/workouts/add-exercise-form";
import { CATEGORIES, CATEGORY_LABEL, isCategory } from "@/lib/workouts";
import { listExercises } from "../queries";
import { updateExerciseMet } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const cat = isCategory(sp.cat) ? sp.cat : null;
  const needle = q.toLowerCase();
  const all = await listExercises();
  const list = all.filter(
    (e) => (!cat || e.category === cat) && (!needle || e.name.toLowerCase().includes(needle) || e.muscleGroup?.toLowerCase().includes(needle)),
  );
  const href = (c: string | null) => {
    const qs = new URLSearchParams({ ...(q && { q }), ...(c && { cat: c }) }).toString();
    return `/workouts/exercises${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <Link href="/workouts" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Tập luyện
      </Link>
      <PageHeader title="Thư viện bài tập" subtitle={`${all.length} bài tập · chạm vào một bài để xem tiến độ`} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          <form className="relative">
            {cat && <input type="hidden" name="cat" value={cat} />}
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Tìm bài tập hoặc nhóm cơ" className="pl-9" />
          </form>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {[null, ...CATEGORIES].map((c) => (
              <Link
                key={c ?? "all"}
                href={href(c)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-sm transition",
                  cat === c ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-surface-2",
                )}
              >
                {c ? CATEGORY_LABEL[c] : "Tất cả"}
              </Link>
            ))}
          </div>

          {list.length === 0 ? (
            <EmptyState title="Không tìm thấy bài tập">Thử từ khoá khác hoặc thêm bài tập mới.</EmptyState>
          ) : (
            <div className="rounded-2xl border border-border bg-surface">
              <ul className="divide-y divide-border">
                {list.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Link href={`/workouts/exercises/${e.id}`} className="min-w-0 flex-1 hover:text-accent">
                      <span className="block truncate text-sm font-medium">{e.name}</span>
                      <span className="block text-xs text-muted">
                        {CATEGORY_LABEL[isCategory(e.category) ? e.category : "other"]}
                        {e.muscleGroup && ` · ${e.muscleGroup}`}
                        {e._count.entries > 0 && ` · đã tập ${e._count.entries} lần`}
                      </span>
                    </Link>
                    <form action={updateExerciseMet.bind(null, e.id)} className="flex shrink-0 items-center gap-1">
                      <label className="text-xs text-muted" htmlFor={`met-${e.id}`}>
                        MET
                      </label>
                      <div className="w-16">
                        <Input id={`met-${e.id}`} name="met" required inputMode="decimal" defaultValue={e.met} className="text-right" />
                      </div>
                      <button type="submit" aria-label={`Lưu MET ${e.name}`} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent">
                        <Check className="size-4" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* First on phones so it isn't buried under the whole library. */}
        <div className="order-first lg:order-last">
          <details className="group rounded-2xl border border-border bg-surface p-4 sm:p-5" open={!all.length}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold uppercase tracking-wide text-muted">
              Thêm bài tập tự tạo
              <Plus className="size-4 transition group-open:rotate-45" />
            </summary>
            <div className="mt-4">
              <AddExerciseForm />
            </div>
            <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm text-muted">
              <h3 className="font-medium text-foreground">MET là gì?</h3>
              <p>
                MET (đương lượng chuyển hoá) cho biết hoạt động tốn năng lượng gấp bao nhiêu lần so với ngồi yên (1 MET ≈ 1 kcal/kg/giờ).
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>Giãn cơ, yoga nhẹ: 2–3</li>
                <li>Tập tạ, tập máy: 3,5–6</li>
                <li>Đạp xe, chạy chậm: 6–8</li>
                <li>Chạy nhanh, nhảy dây, HIIT: 8–12</li>
              </ul>
              <p>
                Calo = (MET × hệ số cường độ − 1) × kg × giờ. Đổi MET chỉ áp dụng cho buổi tập lưu sau đó; buổi cũ giữ nguyên số đã tính.
              </p>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
