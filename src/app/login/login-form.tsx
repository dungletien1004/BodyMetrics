"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { login, type LoginState } from "./actions";
import { PasswordInput } from "./password-input";

// noValidate: the browser's own "Please fill out this field" bubble is English; the server
// answers in Vietnamese instead.
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Tên đăng nhập">
        <Input
          key={state?.username ?? ""}
          name="username"
          defaultValue={state?.username ?? ""}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={!state?.username}
        />
      </Field>
      <Field label="Mật khẩu">
        <PasswordInput name="password" autoComplete="current-password" autoFocus={Boolean(state?.username)} />
      </Field>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
      <p className="text-center text-xs text-muted">Quên mật khẩu? Liên hệ quản trị viên để đặt lại.</p>
    </form>
  );
}
