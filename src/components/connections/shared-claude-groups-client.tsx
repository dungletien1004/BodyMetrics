"use client";

import { useActionState } from "react";
import { Button, LinkButton } from "@/components/ui";
import { mcpResourceFor } from "@/lib/oauth/origin";
import { CopyButton } from "./copy-button";
import {
  createSharedGroup,
  deleteSharedGroup,
  joinSharedGroup,
  leaveSharedGroup,
  removeSharedGroupMember,
  rotateSharedGroupJoinCode,
  type SharedGroupActionState,
} from "./shared-group-actions";

type Person = { id: string; username: string; name: string };
type Group = {
  id: string;
  name: string;
  ownerUserId: string;
  owner: Person;
  members: Person[];
  connected: boolean;
};

function personName(person: Person) {
  return person.name.trim() || person.username;
}

function ActionMessage({ state }: { state: SharedGroupActionState }) {
  if (state?.error) return <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p>;
  if (state?.message) return <p role="status" className="mt-2 text-sm text-accent">{state.message}</p>;
  return null;
}

function JoinCode({ state }: { state: SharedGroupActionState }) {
  if (!state?.joinCode) return null;
  return (
    <div className="mt-2 rounded-xl bg-surface-2 p-3" role="status">
      <p className="mb-2 text-xs text-muted">Mã chỉ hiện ở đây; hãy gửi riêng cho thành viên bạn tin cậy.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all text-sm">{state.joinCode}</code>
        <CopyButton text={state.joinCode} />
      </div>
    </div>
  );
}

function CreateGroupForm() {
  const [state, action, pending] = useActionState(createSharedGroup, null);
  return (
    <form action={action} className="rounded-xl border border-border p-3">
      <label className="mb-2 block text-sm font-medium" htmlFor="shared-group-name">Tạo nhóm Claude dùng chung</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="shared-group-name"
          name="name"
          maxLength={60}
          placeholder="Ví dụ: Gia đình"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={pending}>{pending ? "Đang tạo…" : "Tạo nhóm"}</Button>
      </div>
      <ActionMessage state={state} />
      <JoinCode state={state} />
    </form>
  );
}

function JoinGroupForm() {
  const [state, action, pending] = useActionState(joinSharedGroup, null);
  return (
    <form action={action} className="rounded-xl border border-border p-3">
      <label className="mb-2 block text-sm font-medium" htmlFor="shared-group-code">Tham gia nhóm Claude</label>
      <p className="mb-2 text-xs text-muted">
        Khi tham gia, bạn đồng ý cho Claude đọc, ghi và xóa nhật ký trong hồ sơ của mình qua nhóm này. Chỉ xóa khi bạn yêu cầu; mỗi lần thao tác Claude phải chọn đúng hồ sơ.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="shared-group-code"
          name="joinCode"
          required
          autoComplete="off"
          placeholder="Dán mã mời"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={pending}>{pending ? "Đang tham gia…" : "Tham gia"}</Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

function GroupInviteCode({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState(rotateSharedGroupJoinCode, null);
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="groupId" value={groupId} />
      <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-2 text-xs">
        {pending ? "Đang tạo mã…" : "Tạo mã mời"}
      </Button>
      <ActionMessage state={state} />
      <JoinCode state={state} />
    </form>
  );
}

export function SharedClaudeGroupsClient({ userId, origin, groups }: { userId: string; origin: string; groups: Group[] }) {
  return (
    <section className="mt-5 border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">Claude dùng chung nhiều hồ sơ</h3>
      <p className="mb-3 text-xs text-muted">
        Mỗi người tham gia bằng tài khoản BodyMetrics của mình. Sau đó chủ nhóm kết nối một connector Claude; Claude chỉ thao tác trên hồ sơ đã tham gia và được chọn. Xóa bản ghi chỉ khi người dùng yêu cầu.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <CreateGroupForm />
        <JoinGroupForm />
      </div>

      {groups.length > 0 && (
        <ul className="mt-3 space-y-3">
          {groups.map((group) => {
            const isOwner = group.ownerUserId === userId;
            const url = mcpResourceFor(origin, group.id);
            return (
              <li key={group.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-muted">
                      Chủ nhóm: {personName(group.owner)} · {group.members.length} hồ sơ đã tham gia
                    </p>
                  </div>
                  {isOwner ? (
                    <form action={deleteSharedGroup}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <Button type="submit" variant="danger" className="px-3 py-2 text-xs">Xóa nhóm</Button>
                    </form>
                  ) : (
                    <form action={leaveSharedGroup}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <Button type="submit" variant="secondary" className="px-3 py-2 text-xs">Rời nhóm</Button>
                    </form>
                  )}
                </div>

                <ul className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
                  {group.members.map((person) => (
                    <li key={person.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {personName(person)}
                        {person.name.trim() && person.name.trim() !== person.username ? <span className="text-muted"> · @{person.username}</span> : null}
                        {person.id === group.ownerUserId ? " · chủ nhóm" : ""}
                      </span>
                      {isOwner && person.id !== userId && (
                        <form action={removeSharedGroupMember}>
                          <input type="hidden" name="groupId" value={group.id} />
                          <input type="hidden" name="memberUserId" value={person.id} />
                          <button type="submit" className="text-xs text-danger underline-offset-2 hover:underline">Gỡ</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>

                {isOwner ? (
                  <>
                    <div className="mt-3 rounded-xl bg-surface-2 p-3">
                      <p className="mb-2 text-xs text-muted">URL connector cho cả nhóm</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
                          <CopyButton text={url} />
                        </div>
                        <LinkButton
                          href="https://claude.ai/settings/connectors?modal=add-custom-connector"
                          target="_blank"
                          rel="noreferrer"
                          variant="secondary"
                          className="w-full sm:w-auto"
                        >
                          Mở Claude
                        </LinkButton>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {group.connected ? "Claude đã được cấp quyền cho nhóm." : "Sau khi các thành viên tham gia, thêm URL này vào Claude và cấp quyền bằng tài khoản chủ nhóm."}
                        {" "}Mỗi lần đọc/ghi, Claude cần chọn hồ sơ từ <code>list_profiles</code>.
                      </p>
                    </div>
                    <GroupInviteCode groupId={group.id} />
                  </>
                ) : (
                  <p className="mt-3 text-xs text-muted">Chủ nhóm sẽ kết nối Claude cho nhóm này. Bạn có thể rời nhóm bất kỳ lúc nào.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
