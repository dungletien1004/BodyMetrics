import { revalidatePath } from "next/cache";
import { attachPhotos, readUploadToken } from "@/lib/photos";

// Upload endpoint for Claude's code sandbox: the attach_photo connector tool hands out a signed,
// short-lived link bound to one user's meal or workout, and the sandbox POSTs the chat photo here.
// Accepts multipart (field "photo" or "file") or a raw image body.

export const runtime = "nodejs";

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const grant = await readUploadToken((await params).token);
  if (!grant) return reply(401, { ok: false, error: "Link tải ảnh không hợp lệ hoặc đã hết hạn. Gọi lại attach_photo để lấy link mới." });

  const type = req.headers.get("content-type") ?? "";
  let file: File | null = null;
  try {
    if (type.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("photo") ?? form.get("file");
      file = f instanceof File && f.size > 0 ? f : null;
    } else if (type.startsWith("image/")) {
      const data = new Uint8Array(await req.arrayBuffer());
      file = data.byteLength ? new File([data], "photo", { type: type.split(";")[0] }) : null;
    }
  } catch {
    return reply(400, { ok: false, error: "Không đọc được dữ liệu tải lên." });
  }
  if (!file) return reply(400, { ok: false, error: 'Gửi ảnh dạng multipart (trường "photo") hoặc body ảnh có Content-Type image/*.' });

  const res = await attachPhotos(grant.userId, grant.target, [file]);
  if (!res.ok) return reply(422, res);
  revalidatePath("/", "layout");
  return reply(200, { ok: true, photo_id: res.photoIds[0], attached_to: grant.target });
}
