import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Card, CardTitle, LinkButton, Stat } from "@/components/ui";
import { countOtherActiveAdmins, getUserStats } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { formatDayShort } from "@/lib/dates";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { lastActivityLabel, RoleBadge, StatusBadge, ViewAsButton, WeightChange } from "../../user-bits";
import { ActiveToggle, DeleteUserForm, EditUserForm, ResetPasswordForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
  });
  if (!user) notFound();

  const [week, month, otherAdmins] = await Promise.all([
    getUserStats([user.id], 7),
    getUserStats([user.id], 30),
    countOtherActiveAdmins(user.id),
  ]);
  const s7 = week.get(user.id)!;
  const s30 = month.get(user.id)!;

  // Same rules as the server actions; these only decide what the page offers.
  const isSelf = user.id === me.id;
  const lastAdmin = user.role === "admin" && user.active && otherAdmins === 0;
  const removalBlocked = isSelf
    ? "Bạn không thể khóa, hạ quyền hay xóa chính tài khoản của mình."
    : lastAdmin
      ? "Đây là quản trị viên đang hoạt động cuối cùng, không thể khóa, hạ quyền hay xóa."
      : null;

  return (
    <>
      <LinkButton href="/admin" variant="ghost" className="mb-3 -ml-3">
        <ArrowLeft className="size-4" /> Danh sách
      </LinkButton>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{user.name || user.username}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>@{user.username}</span>
            {isSelf && <span>· bạn</span>}
            <RoleBadge role={user.role} />
            <StatusBadge active={user.active} />
            <span>· tạo {format(user.createdAt, "dd/MM/yyyy")}</span>
          </div>
        </div>
        <ViewAsButton userId={user.id} self={isSelf} />
      </div>

      <Card className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Hoạt động gần nhất" value={<span className="text-base">{lastActivityLabel(s7.lastActivity)}</span>} />
        <Stat label="Bữa ăn" value={num(s7.meals, 0)} tone="intake" />
        <Stat label="Buổi tập" value={num(s7.workouts, 0)} tone="burn" />
        <Stat label="Lần cân đo" value={num(s7.bodyLogs, 0)} />
        <Stat
          label="Cân nặng mới nhất"
          value={num(s7.latestWeight)}
          unit={s7.latestWeight != null ? "kg" : undefined}
          sub={s7.latestWeightDate ? formatDayShort(s7.latestWeightDate) : undefined}
        />
        <Stat
          label="Thay đổi 7 ngày"
          value={<span className="text-base"><WeightChange value={s7.weightChange} /></span>}
          sub={
            <>
              30 ngày: <WeightChange value={s30.weightChange} />
            </>
          }
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Thông tin</CardTitle>
          <EditUserForm
            userId={user.id}
            name={user.name}
            role={user.role}
            roleLocked={user.role === "admin" && removalBlocked ? removalBlocked : null}
          />
        </Card>

        <Card>
          <CardTitle>Đặt lại mật khẩu</CardTitle>
          <p className="mb-3 text-sm text-muted">Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và phải đăng nhập bằng mật khẩu mới.</p>
          <ResetPasswordForm userId={user.id} username={user.username} />
        </Card>

        <Card>
          <CardTitle>{user.active ? "Khóa tài khoản" : "Mở khóa"}</CardTitle>
          <ActiveToggle userId={user.id} active={user.active} blocked={removalBlocked} />
        </Card>

        <Card>
          <CardTitle>Xóa tài khoản</CardTitle>
          <DeleteUserForm userId={user.id} username={user.username} blocked={removalBlocked} />
        </Card>
      </div>
    </>
  );
}
