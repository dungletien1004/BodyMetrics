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
        subtitle="Bạn đặt mật khẩu tạm; ở lần đăng nhập đầu, người dùng phải đổi sang mật khẩu của riêng mình."
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
