import { Activity, KeyRound } from "lucide-react";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { CHANGE_PASSWORD_PATH, getCurrentUser, safeNext } from "@/lib/auth";
import { logout } from "../login/actions";
import { ChangePasswordForm } from "./change-form";

// Standalone (outside the app layout): accounts created or reset by an admin land here first
// and pick their own password. requireUser() sends them here from every app and admin page.

export const dynamic = "force-dynamic";

export const metadata = { title: "Đặt mật khẩu mới · BodyMetrics" };

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(CHANGE_PASSWORD_PATH)}`);
  if (!user.mustChangePassword) redirect(next);

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-xl font-semibold">
          <Activity className="size-6 text-accent" /> BodyMetrics
        </div>
        <Card>
          <div className="mb-4 flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2">
              <KeyRound className="size-5 text-accent" />
            </span>
            <div>
              <h1 className="font-semibold">Đặt mật khẩu của riêng bạn</h1>
              <p className="mt-1 text-sm text-muted">
                Chào {user.name || user.username}! Mật khẩu hiện tại do quản trị viên đặt. Hãy chọn mật khẩu mới chỉ mình bạn biết trước khi
                tiếp tục.
              </p>
            </div>
          </div>
          <ChangePasswordForm next={next} />
        </Card>
        <form action={logout} className="mt-4 text-center text-sm text-muted">
          Không phải {user.username}?{" "}
          <button type="submit" className="font-medium text-accent underline-offset-2 hover:underline">
            Đăng xuất
          </button>
        </form>
      </div>
    </main>
  );
}
