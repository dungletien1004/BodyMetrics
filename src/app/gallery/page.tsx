import Link from "next/link";
import { Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDayLong } from "@/lib/dates";
import { uploadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

const KINDS = [
  { value: "all", label: "Tất cả" },
  { value: "food", label: "Món ăn" },
  { value: "body", label: "Cơ thể" },
];

const PAGE_SIZE = 120;

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ kind?: string; page?: string }> }) {
  const sp = await searchParams;
  const kind = KINDS.some((k) => k.value === sp.kind) ? sp.kind! : "all";
  const page = Math.max(1, Number(sp.page) || 1);

  const where = kind === "all" ? {} : { kind };
  const [photos, total] = await Promise.all([
    db.photo.findMany({
      where,
      orderBy: [{ date: "desc" }, { takenAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.photo.count({ where }),
  ]);

  const groups = new Map<string, typeof photos>();
  for (const p of photos) groups.set(p.date, [...(groups.get(p.date) ?? []), p]);
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <PageHeader title="Thư viện ảnh" subtitle={`${total} ảnh`} />

      <div className="mb-4 flex gap-1">
        {KINDS.map((k) => (
          <Link
            key={k.value}
            href={k.value === "all" ? "/gallery" : `/gallery?kind=${k.value}`}
            className={cn(
              "rounded-xl px-3 py-1.5 text-sm",
              k.value === kind ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface-2",
            )}
          >
            {k.label}
          </Link>
        ))}
      </div>

      {photos.length === 0 ? (
        <EmptyState title="Chưa có ảnh nào">Ảnh món ăn và ảnh tiến trình bạn tải lên sẽ hiện ở đây.</EmptyState>
      ) : (
        <div className="space-y-4">
          {[...groups].map(([date, items]) => (
            <Card key={date}>
              <h2 className="mb-3 text-sm font-medium">{formatDayLong(date)}</h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {items.map((p) => {
                  const href = p.mealId ? `/meals/${p.mealId}` : p.bodyLogId ? "/body" : uploadUrl(p.path);
                  return (
                    <Link key={p.id} href={href} className="group relative block overflow-hidden rounded-xl bg-surface-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={uploadUrl(p.path)}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full object-cover transition group-hover:scale-105"
                      />
                      <span className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                        {p.kind === "food" ? "Món ăn" : "Cơ thể"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={`/gallery?kind=${kind}&page=${page - 1}`} className="rounded-lg px-3 py-1.5 hover:bg-surface-2">
              ← Mới hơn
            </Link>
          )}
          <span className="px-3 py-1.5 text-muted">
            {page} / {pages}
          </span>
          {page < pages && (
            <Link href={`/gallery?kind=${kind}&page=${page + 1}`} className="rounded-lg px-3 py-1.5 hover:bg-surface-2">
              Cũ hơn →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
