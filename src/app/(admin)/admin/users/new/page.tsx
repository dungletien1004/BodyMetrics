import { ArrowLeft } from "lucide-react";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { CreateUserForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requireAdmin();
  return (
    <div className="max-w-xl">
      <PageHeader
        title="Thêm người dùng"
        subtitle="Người dùng đăng nhập bằng tên và mật khẩu bạn đặt, rồi có thể tự đổi mật khẩu trong Hồ sơ."
        action={
          <LinkButton href="/admin" variant="ghost">
            <ArrowLeft className="size-4" /> Danh sách
          </LinkButton>
        }
      />
      <Card>
        <CreateUserForm />
      </Card>
    </div>
  );
}
