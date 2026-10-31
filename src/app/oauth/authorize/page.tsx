import { Activity, BookOpen, Ban, PenLine, ShieldCheck, Trash2 } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { changePasswordUrl, getCurrentUser } from "@/lib/auth";
import { AUTHORIZE_FIELDS, checkAuthorizeRequest, pickAuthorizeParams } from "@/lib/oauth/authorize";
import { originFromHeaders } from "@/lib/oauth/origin";
import { displayName, findActiveUser } from "@/lib/oauth/tokens";
import { switchAccount } from "./actions";

// OAuth consent screen for the claude.ai connector. The decision posts to /api/oauth/authorize.

export const dynamic = "force-dynamic";

export const metadata = { title: "Kết nối Claude · BodyMetrics" };

// Must match the tools in src/lib/mcp/server.ts exactly.
const CAN_DO = [
  { icon: BookOpen, text: "Đọc mục tiêu, tổng kết từng ngày, bữa ăn, buổi tập, cân nặng và thư viện bài tập của bạn" },
  { icon: PenLine, text: "Ghi bữa ăn, buổi tập (kể cả thêm bài tập mới vào thư viện), cân nặng, vòng eo và % mỡ" },
  { icon: Trash2, text: "Xóa bữa ăn, buổi tập hoặc lần cân đo khi bạn yêu cầu (kể cả ảnh đính kèm)" },
];
const CANNOT = "Không xem được ảnh, không sửa hồ sơ, mật khẩu hay dữ liệu của người khác.";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-xl font-semibold">
          <Activity className="size-6 text-accent" /> BodyMetrics
        </div>
        <Card>{children}</Card>
      </div>
    </main>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <Shell>
      <h1 className="mb-2 font-semibold">Không thể kết nối</h1>
      <p className="text-sm text-muted">{message}</p>
    </Shell>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const params = pickAuthorizeParams((k) => sp[k]);

  const here = `/oauth/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`;
  const sessionUser = await getCurrentUser();
  if (!sessionUser) redirect(`/login?next=${encodeURIComponent(here)}`);
  // An admin-set password is replaced before granting anything; the change page comes back here.
  if (sessionUser.mustChangePassword) redirect(changePasswordUrl(here));
  const user = await findActiveUser(sessionUser.id);
  if (!user) return <Problem message="Tài khoản của bạn đã bị khóa nên không thể kết nối với Claude." />;

  const origin = originFromHeaders(await headers());
  const check = await checkAuthorizeRequest(params, origin);
  if (check.kind === "fatal") return <Problem message={check.message} />;
  if (check.kind === "redirect") redirect(check.url);

  const { client, redirectUri } = check.request;
  const name = displayName(user);

  return (
    <Shell>
      <div className="mb-4 flex justify-center">
        <span className="grid size-12 place-items-center rounded-full bg-surface-2">
          <ShieldCheck className="size-6 text-accent" />
        </span>
      </div>
      <h1 className="mb-1 text-center text-lg font-semibold text-balance">
        Cho phép {client.name} truy cập dữ liệu BodyMetrics của {name}?
      </h1>
      <form action={switchAccount.bind(null, here)} className="mb-4 text-center text-sm text-muted">
        Đang đăng nhập: <span className="font-medium text-foreground">{user.username}</span>
        <br />
        Không phải {name}?{" "}
        <button type="submit" className="font-medium text-accent underline-offset-2 hover:underline">
          Đăng nhập tài khoản khác
        </button>
      </form>

      <p className="mb-2 text-sm font-medium">Ứng dụng sẽ có thể:</p>
      <ul className="mb-4 space-y-2">
        {CAN_DO.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>{text}</span>
          </li>
        ))}
        <li className="flex items-start gap-2 text-sm text-muted">
          <Ban className="mt-0.5 size-4 shrink-0" />
          <span>{CANNOT}</span>
        </li>
      </ul>
      <p className="mb-5 text-xs text-muted">
        Sau khi chọn, bạn sẽ được chuyển về <span className="font-medium break-all">{new URL(redirectUri).host}</span>. Có thể thu hồi
        quyền bất kỳ lúc nào trong Hồ sơ → Kết nối Claude.
      </p>

      <form method="post" action="/api/oauth/authorize" className="grid grid-cols-2 gap-3">
        {AUTHORIZE_FIELDS.map((k) => (params[k] === undefined ? null : <input key={k} type="hidden" name={k} value={params[k]} />))}
        <Button type="submit" name="decision" value="deny" variant="secondary">
          Từ chối
        </Button>
        <Button type="submit" name="decision" value="allow">
          Cho phép
        </Button>
      </form>
    </Shell>
  );
}
