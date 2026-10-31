"use client";

import { Check, Copy, Eye, EyeOff, KeyRound, Lock, LockOpen, Shuffle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createUser, deleteUser, resetPassword, setActive, updateUser, type AdminFormState } from "../actions";
import { LockedForm } from "../locked-form";
import { randomPassword, USERNAME_RE } from "../password";

const MIN_PASSWORD = 8;

// The forms use noValidate and these checks instead of the browser's English bubbles.
function usernameError(v: string): string | null {
  if (!v) return "Nhập tên đăng nhập.";
  if (v.length < 3 || v.length > 32) return "Tên đăng nhập cần 3–32 ký tự.";
  if (!USERNAME_RE.test(v)) return "Chỉ dùng chữ thường không dấu, số và dấu . _ -";
  return null;
}

function passwordError(v: string): string | null {
  if (!v) return "Nhập mật khẩu hoặc bấm Tạo ngẫu nhiên.";
  if (v.length < MIN_PASSWORD) return `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`;
  return null;
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} role="alert" className="block text-xs text-danger">
      {children}
    </span>
  );
}

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
function OneTimePassword({
  username,
  password,
  mustChange,
  children,
}: {
  username?: string;
  password: string;
  mustChange?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-amber-400/60 bg-amber-400/10 p-4 text-sm">
      <p className="font-medium">
        {mustChange ? "Gửi thông tin đăng nhập này cho người dùng. Mật khẩu chỉ hiển thị một lần." : "Mật khẩu mới chỉ hiển thị một lần."}
      </p>
      {mustChange && (
        <p className="mt-1 text-muted">Đây là mật khẩu tạm: ở lần đăng nhập đầu, người dùng phải đổi sang mật khẩu của riêng mình.</p>
      )}
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
function PasswordField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint={error ? undefined : `Ít nhất ${MIN_PASSWORD} ký tự`}>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "password-error" : undefined}
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
      {error && <FieldError id="password-error">{error}</FieldError>}
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
  // Inline checks start after the first submit, then follow every keystroke.
  const [tried, setTried] = useState(false);
  // A server error belongs to the answer it came with; editing the form hides it.
  const [seen, setSeen] = useState<AdminFormState>(null);
  useEffect(() => {
    if (state?.ok) {
      setUsername("");
      setName("");
      setRole("user");
      setPassword("");
      setTried(false);
    }
  }, [state]);

  const server = state?.error && state !== seen ? state : null;
  const errors = {
    username: (tried && usernameError(username)) || (server?.field === "username" ? server.error : null),
    password: (tried && passwordError(password)) || (server?.field === "password" ? server.error : null),
  };

  return (
    <div className="space-y-5">
      {state?.ok && state.password && (
        <OneTimePassword username={state.username} password={state.password} mustChange={state.mustChange}>
          <Link href={`/admin/users/${state.userId}`} className="text-sm font-medium text-accent underline">
            Mở tài khoản vừa tạo
          </Link>
        </OneTimePassword>
      )}
      <LockedForm
        action={action}
        noValidate
        onSubmit={(e) => {
          setTried(true);
          if (usernameError(username) || passwordError(password)) e.preventDefault();
        }}
        className="space-y-4"
      >
        <Field label="Tên đăng nhập" hint={errors.username ? undefined : "3–32 ký tự: chữ thường không dấu, số, dấu . _ -"}>
          <Input
            name="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={errors.username ? "username-error" : undefined}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase());
              setSeen(state);
            }}
          />
          {errors.username && <FieldError id="username-error">{errors.username}</FieldError>}
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
        <PasswordField
          label="Mật khẩu tạm"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setSeen(state);
          }}
          error={errors.password}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Đang tạo…" : "Tạo tài khoản"}
          </Button>
          {server && !server.field && <span className="text-sm text-danger">{server.error}</span>}
        </div>
      </LockedForm>
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
    <LockedForm action={action} className="space-y-4">
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
    </LockedForm>
  );
}

export function ResetPasswordForm({ userId, username }: { userId: string; username: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(resetPassword.bind(null, userId), null);
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const [seen, setSeen] = useState<AdminFormState>(null);
  useEffect(() => {
    if (state?.ok) {
      setPassword("");
      setTried(false);
    }
  }, [state]);
  const server = state?.error && state !== seen ? state : null;
  const error = (tried && passwordError(password)) || (server?.field === "password" ? server.error : null);

  return (
    <div className="space-y-4">
      {state?.ok && state.password && (
        <OneTimePassword username={username} password={state.password} mustChange={state.mustChange}>
          <span className="text-muted">{state.ok}</span>
        </OneTimePassword>
      )}
      <LockedForm
        action={action}
        noValidate
        onSubmit={(e) => {
          setTried(true);
          if (passwordError(password)) e.preventDefault();
        }}
        className="space-y-4"
      >
        <PasswordField
          label="Mật khẩu mới"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setSeen(state);
          }}
          error={error}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            <KeyRound className="size-4" /> {pending ? "Đang đặt…" : "Đặt mật khẩu mới"}
          </Button>
          {server && !server.field && <span className="text-sm text-danger">{server.error}</span>}
        </div>
      </LockedForm>
    </div>
  );
}

export function ActiveToggle({ userId, active, blocked }: { userId: string; active: boolean; blocked: string | null }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(setActive.bind(null, userId, !active), null);
  return (
    <LockedForm
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
    </LockedForm>
  );
}

export function DeleteUserForm({ userId, username, blocked }: { userId: string; username: string; blocked: string | null }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(deleteUser.bind(null, userId), null);
  const [typed, setTyped] = useState("");
  if (blocked) return <p className="text-sm text-muted">{blocked}</p>;
  return (
    <LockedForm action={action} className="space-y-3">
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
    </LockedForm>
  );
}
