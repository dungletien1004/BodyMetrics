"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Tên đăng nhập">
        <Input
          key={state?.username ?? ""}
          name="username"
          defaultValue={state?.username ?? ""}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          autoFocus={!state?.username}
        />
      </Field>
      <Field label="Mật khẩu">
        <Input name="password" type="password" autoComplete="current-password" required autoFocus={Boolean(state?.username)} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
