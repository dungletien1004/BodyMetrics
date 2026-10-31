import { format } from "date-fns";
import { headers } from "next/headers";
import { Button, Card, CardTitle, LinkButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { mcpResourceFor, originFromHeaders } from "@/lib/oauth/origin";
import { listGrants } from "@/lib/oauth/tokens";
import { revokeConnection } from "./actions";
import { CopyButton } from "./copy-button";
import { RefreshConnectionStatus } from "./refresh-connection-status";
import { SharedClaudeGroups } from "./shared-claude-groups";

// "Kết nối Claude" on /profile: the connector URL, how to add it, and the signed-in user's
// active grants with a revoke button.

export async function ClaudeConnections() {
  const user = await requireUser();
  const [grants, h] = await Promise.all([listGrants(user.id), headers()]);
  const url = mcpResourceFor(originFromHeaders(h));
  const at = (d: Date) => format(d, "dd/MM/yyyy HH:mm");

  return (
    <Card className="mt-4">
      <CardTitle>Kết nối Claude</CardTitle>
      <p className="mb-2 text-sm text-muted">URL connector</p>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-surface-2 px-3 py-2 text-sm select-all">{url}</code>
          <CopyButton text={url} />
        </div>
        <LinkButton
          href="https://claude.ai/settings/connectors?modal=add-custom-connector"
          target="_blank"
          rel="noreferrer"
          variant="secondary"
          className="w-full shrink-0 sm:w-auto"
        >
          Mở Claude để kết nối
        </LinkButton>
      </div>
      <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm">
        <li>
          Claude mở trang thêm connector. Nếu cần, đăng nhập Claude, rồi chọn <b>Add custom connector</b> trong mục <b>Customize → Connectors</b>.
        </li>
        <li>Đặt tên <b>BodyMetrics</b>, dán URL ở trên, bấm <b>Add</b> rồi <b>Connect</b>.</li>
        <li>
          Đăng nhập bằng tài khoản BodyMetrics của bạn và bấm <b>Cho phép</b>.
        </li>
        <li>Quay lại đây để xem trạng thái. Sau khi Claude gọi công cụ lần đầu, mục “dùng gần nhất” sẽ cập nhật.</li>
      </ol>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Đang kết nối</p>
        <RefreshConnectionStatus />
      </div>
      {grants.length === 0 ? (
        <p className="text-sm text-muted">Chưa có ứng dụng nào được cấp quyền.</p>
      ) : (
        <ul className="divide-y divide-border">
          {grants.map((g) => (
            <li key={g.clientId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{g.name}</p>
                <p className="text-xs text-muted">
                  {g.connectionGroupName ? `Nhóm ${g.connectionGroupName} · ` : ""}
                  Kết nối {at(g.createdAt)} · {g.lastUsedAt ? `dùng gần nhất ${at(g.lastUsedAt)}` : "chưa dùng"}
                </p>
              </div>
              <form action={revokeConnection.bind(null, g.clientId, g.connectionGroupId)} className="shrink-0">
                <Button type="submit" variant="danger" className="whitespace-nowrap">
                  Thu hồi
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <SharedClaudeGroups />
    </Card>
  );
}
