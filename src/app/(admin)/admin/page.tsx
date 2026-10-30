import { format } from "date-fns";
import { ChevronRight, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { Button, Card, cn, EmptyState, Input, LinkButton, PageHeader, Stat } from "@/components/ui";
import { getAdminOverview, getUserStats, parseRange, WEIGHT_RANGES, type UserStats } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { lastActivityLabel, RoleBadge, StatusBadge, ViewAsButton, Weight, WeightChange } from "./user-bits";

export const dynamic = "force-dynamic";

const EMPTY: UserStats = { meals: 0, workouts: 0, bodyLogs: 0, lastActivity: null, latestWeight: null, latestWeightDate: null, weightChange: null };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const range = parseRange(sp.range);

  const [overview, users] = await Promise.all([
    getAdminOverview(),
    db.user.findMany({
      where: q
        ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
        : undefined,
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
    }),
  ]);
  const stats = await getUserStats(
    users.map((u) => u.id),
    range,
  );
  const rows = users.map((u) => ({ ...u, stats: stats.get(u.id) ?? EMPTY }));
  const rangeHref = (r: number) => `/admin?${new URLSearchParams({ ...(q ? { q } : {}), range: String(r) })}`;

  return (
    <>
      <PageHeader
        title="Người dùng"
        subtitle="Quản lý tài khoản và xem dữ liệu của từng người"
        action={
          <LinkButton href="/admin/users/new">
            <UserPlus className="size-4" /> Thêm người dùng
          </LinkButton>
        }
      />

      {sp.deleted && (
        <p className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          Đã xóa tài khoản <b>{sp.deleted}</b> cùng toàn bộ dữ liệu.
        </p>
      )}

      <Card className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Tổng người dùng" value={num(overview.users, 0)} />
        <Stat label="Hoạt động 7 ngày" value={num(overview.activeUsers7d, 0)} sub="có ghi bữa ăn, buổi tập hoặc cân" tone="accent" />
        <Stat label="Bữa ăn 7 ngày" value={num(overview.meals7d, 0)} tone="intake" />
        <Stat label="Buổi tập 7 ngày" value={num(overview.workouts7d, 0)} tone="burn" />
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action="/admin" className="flex min-w-0 flex-1 gap-2 sm:max-w-sm">
          {range !== 7 && <input type="hidden" name="range" value={range} />}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Tìm theo tên hoặc tên đăng nhập" aria-label="Tìm người dùng" style={{ paddingLeft: "2.25rem" }} />
          </div>
          <Button type="submit" variant="secondary">
            Tìm
          </Button>
        </form>
        <div className="flex items-center gap-1 text-sm" role="group" aria-label="Khoảng thay đổi cân nặng">
          <span className="mr-1 text-muted">Thay đổi cân:</span>
          {WEIGHT_RANGES.map((r) => (
            <Link
              key={r}
              href={rangeHref(r)}
              className={cn("rounded-lg px-2.5 py-1", r === range ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface-2")}
            >
              {r} ngày
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={q ? `Không có ai khớp “${q}”` : "Chưa có người dùng"}>
          {q && <Link href="/admin" className="text-accent underline">Xóa bộ lọc</Link>}
        </EmptyState>
      ) : (
        <>
          {/* Phones: one card per user. */}
          <ul className="space-y-3 md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <Card>
                  <Link href={`/admin/users/${u.id}`} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{u.name || u.username}</div>
                      <div className="truncate text-sm text-muted">
                        @{u.username}
                        {u.id === me.id && " · bạn"}
                      </div>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted" />
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <RoleBadge role={u.role} />
                    <StatusBadge active={u.active} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Hoạt động gần nhất</dt>
                      <dd>{lastActivityLabel(u.stats.lastActivity)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Cân nặng · {range} ngày</dt>
                      <dd className="flex flex-wrap gap-x-2">
                        <Weight value={u.stats.latestWeight} /> <WeightChange value={u.stats.weightChange} />
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted">Đã ghi</dt>
                      <dd>
                        {u.stats.meals} bữa ăn · {u.stats.workouts} buổi tập · {u.stats.bodyLogs} lần cân đo
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="text-xs text-muted">Tạo {format(u.createdAt, "dd/MM/yyyy")}</span>
                    <ViewAsButton userId={u.id} self={u.id === me.id} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {/* Desktop: table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Người dùng</th>
                  <th className="px-3 py-3 font-medium">Vai trò</th>
                  <th className="px-3 py-3 font-medium">Ngày tạo</th>
                  <th className="px-3 py-3 font-medium">Hoạt động gần nhất</th>
                  <th className="px-3 py-3 text-right font-medium" title="Bữa ăn / buổi tập / lần cân đo">
                    Ăn / Tập / Cân
                  </th>
                  <th className="px-3 py-3 text-right font-medium">Cân nặng</th>
                  <th className="px-3 py-3 text-right font-medium">{range} ngày</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="block hover:text-accent">
                        <div className="font-medium">{u.name || u.username}</div>
                        <div className="text-xs text-muted">
                          @{u.username}
                          {u.id === me.id && " · bạn"}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <RoleBadge role={u.role} />
                        {!u.active && <StatusBadge active={false} />}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">{format(u.createdAt, "dd/MM/yyyy")}</td>
                    <td className="px-3 py-3">{lastActivityLabel(u.stats.lastActivity)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                      {u.stats.meals} / {u.stats.workouts} / {u.stats.bodyLogs}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Weight value={u.stats.latestWeight} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <WeightChange value={u.stats.weightChange} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ViewAsButton userId={u.id} self={u.id === me.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
