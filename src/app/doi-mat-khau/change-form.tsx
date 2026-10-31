"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Field } from "@/components/ui";
import { PasswordInput } from "../login/password-input";
import { setOwnPassword, type ChangeState } from "./actions";

const MIN = 8;

function check(password: string, confirm: string): ChangeState {
  if (password.length < MIN) return { error: `Mật khẩu mới cần ít nhất ${MIN} ký tự.`, field: "password" };
  if (password !== confirm) return { error: "Hai lần nhập không khớp.", field: "confirm" };
  return null;
}

export function ChangePasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<ChangeState, FormData>(setOwnPassword, null);
  // Controlled: React clears uncontrolled fields after every submit, even a rejected one.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [local, setLocal] = useState<ChangeState>(null);
  // Blocks a second submit fired before React has re-rendered with `pending`.
  const busy = useRef(false);
  useEffect(() => {
    busy.current = false;
  }, [state]);

  const shown = local ?? state;

  return (
    <form
      action={action}
      noValidate
      onSubmit={(e) => {
        const error = check(password, confirm);
        setLocal(error);
        if (error || busy.current) e.preventDefault();
        else busy.current = true;
      }}
      className="space-y-4"
    >
      <input type="hidden" name="next" value={next} />
      <Field label="Mật khẩu mới" hint={`Ít nhất ${MIN} ký tự`}>
        <PasswordInput
          name="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={shown?.field === "password" || undefined}
        />
      </Field>
      <Field label="Nhập lại mật khẩu mới">
        <PasswordInput
          name="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={shown?.field === "confirm" || undefined}
        />
      </Field>
      {shown && (
        <p role="alert" className="text-sm text-danger">
          {shown.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Đang lưu…" : "Lưu mật khẩu và tiếp tục"}
      </Button>
    </form>
  );
}
