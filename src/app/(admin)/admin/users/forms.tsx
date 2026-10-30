"use client";

import { Check, Copy, Eye, EyeOff, KeyRound, Lock, LockOpen, Shuffle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createUser, deleteUser, resetPassword, setActive, updateUser, type AdminFormState } from "../actions";
import { randomPassword } from "../password";

function Message({ state }: { state: AdminFormState }) {
  if (state?.error) return <span className="text-sm text-danger">{state.error}</span>;
  if (state?.ok && !state.password) return <span className="text-sm text-accent">{state.ok}</span>;
  return null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground"
      aria-label="Sao chép"
      title="Sao chép"
    >
      {copied ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
    </button>
  );
}

/** The password an admin hands over. Shown once, right after it is set. */
function OneTimePassword({ username, password, children }: { username?: string; password: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-400/60 bg-amber-400/10 p-4 text-sm">
      <p className="font-medium">Gửi thông tin đăng nhập này cho người dùng. Mật khẩu chỉ hiển thị một lần.</p>
      <dl className="mt-3 space-y-1.5">
        {username && (
          <div className="flex items-center gap-2">
            <dt className="w-28 shrink-0 text-muted">Tên đăng nhập</dt>
            <dd className="min-w-0 font-mono break-all">{username}</dd>
            <CopyButton text={username} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <dt className="w-28 shrink-0 text-muted">Mật khẩu</dt>
          <dd className="min-w-0 font-mono text-base break-all">{password}</dd>
          <CopyButton text={password} />
        </div>
      </dl>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Password input with a "Tạo ngẫu nhiên" button; a generated password is shown in clear text. */
function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint="Ít nhất 8 ký tự">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono"
            style={{ paddingRight: "2.5rem" }}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:bg-surface-2"
            aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onChange(randomPassword());
            setVisible(true);
          }}
        >
          <Shuffle className="size-4" /> <span className="whitespace-nowrap">Tạo ngẫu nhiên</span>
        </Button>
      </div>
    </Field>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(createUser, null);
  // Controlled fields: React resets uncontrolled ones after every submit, even a failed one.
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (state?.ok) {
      setUsername("");
      setName("");
      setRole("user");
      setPassword("");
    }
  }, [state]);

  return (
    <div className="space-y-5">
      {state?.ok && state.password && (
        <OneTimePassword username={state.username} password={state.password}>
          <Link href={`/admin/users/${state.userId}`} className="text-sm font-medium text-accent underline">
            Mở tài khoản vừa tạo
          </Link>
        </OneTimePassword>
      )}
      <form action={action} className="space-y-4">
        <Field label="Tên đăng nhập" hint="3–32 ký tự: chữ thường, số, dấu . _ -">
          <Input
            name="username"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            pattern="[a-z0-9._\-]{3,32}"
            title="Chữ thường, số, dấu . _ -"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
          />
        </Field>
        <Field label="Tên hiển thị">
          <Input name="name" autoComplete="off" placeholder="VD: Nguyễn Văn A" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Vai trò">
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">Người dùng</option>
            <option value="admin">Quản trị viên</option>
          </Select>
        </Field>
        <PasswordField label="Mật khẩu ban đầu" value={password} onChange={setPassword} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Đang tạo…" : "Tạo tài khoản"}
          </Button>
          {state?.error && <span className="text-sm text-danger">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}

export function EditUserForm({
  userId,
  name,
  role,
  roleLocked,
}: {
  userId: string;
  name: string;
  role: string;
  roleLocked: string | null; // why the role cannot be lowered, if it can't
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(updateUser.bind(null, userId), null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Tên hiển thị">
        <Input name="name" defaultValue={name} autoComplete="off" />
      </Field>
      <Field label="Vai trò" hint={roleLocked ?? undefined}>
        <Select name="role" defaultValue={role} disabled={!!roleLocked}>
          <option value="user">Người dùng</option>
          <option value="admin">Quản trị viên</option>
        </Select>
        {/* A disabled select is not submitted; keep the current role. */}
        {roleLocked && <input type="hidden" name="role" value={role} />}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu"}
        </Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function ResetPasswordForm({ userId, username }: { userId: string; username: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(resetPassword.bind(null, userId), null);
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (state?.ok) setPassword("");
  }, [state]);

  return (
    <div className="space-y-4">
      {state?.ok && state.password && (
        <OneTimePassword username={username} password={state.password}>
          <span className="text-muted">{state.ok}</span>
        </OneTimePassword>
      )}
      <form action={action} className="space-y-4">
        <PasswordField label="Mật khẩu mới" value={password} onChange={setPassword} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            <KeyRound className="size-4" /> {pending ? "Đang đặt…" : "Đặt mật khẩu mới"}
          </Button>
          <Message state={state} />
        </div>
      </form>
    </div>
  );
}

export function ActiveToggle({ userId, active, blocked }: { userId: string; active: boolean; blocked: string | null }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(setActive.bind(null, userId, !active), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (active && !confirm("Khóa tài khoản này? Người dùng sẽ bị đăng xuất và không đăng nhập được nữa.")) e.preventDefault();
      }}
      className="space-y-2"
    >
      <p className="text-sm text-muted">
        {active
          ? "Tài khoản bị khóa không đăng nhập được và bị đăng xuất khỏi mọi thiết bị. Dữ liệu vẫn được giữ."
          : "Tài khoản đang bị khóa. Mở khóa để người dùng đăng nhập lại bằng mật khẩu hiện tại."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={active ? "danger" : "secondary"} disabled={pending || (active && !!blocked)} className={active ? "border border-border" : undefined}>
          {active ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          {active ? "Khóa tài khoản" : "Mở khóa"}
        </Button>
        {active && blocked && <span className="text-sm text-muted">{blocked}</span>}
        <Message state={state} />
      </div>
    </form>
  );
}

export function DeleteUserForm({ userId, username, blocked }: { userId: string; username: string; blocked: string | null }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(deleteUser.bind(null, userId), null);
  const [typed, setTyped] = useState("");
  if (blocked) return <p className="text-sm text-muted">{blocked}</p>;
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">
        Xóa vĩnh viễn tài khoản cùng toàn bộ bữa ăn, buổi tập, số đo, ảnh và báo cáo. Không thể hoàn tác.
      </p>
      <Field label={`Gõ "${username}" để xác nhận`}>
        <Input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        {/* Plain button: Button's variants set their own background and cn() does not merge classes. */}
        <button
          type="submit"
          disabled={pending || typed.trim() !== username}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-4" /> {pending ? "Đang xóa…" : "Xóa tài khoản"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}
