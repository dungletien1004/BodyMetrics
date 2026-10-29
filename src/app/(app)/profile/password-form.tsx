"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Field, Input } from "@/components/ui";
import { changePassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <Field label="Mật khẩu hiện tại">
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Mật khẩu mới" hint="Ít nhất 8 ký tự">
        <Input name="next" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Nhập lại mật khẩu mới">
        <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Đang đổi…" : "Đổi mật khẩu"}
        </Button>
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
        {state?.ok && <span className="text-sm text-accent">{state.ok}</span>}
      </div>
    </form>
  );
}
