import { Activity } from "lucide-react";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Đăng nhập · BodyMetrics" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-xl font-semibold">
          <Activity className="size-6 text-accent" /> BodyMetrics
        </div>
        <Card>
          <LoginForm next={next} />
        </Card>
      </div>
    </main>
  );
}
