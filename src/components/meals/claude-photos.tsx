"use client";

import { Camera, Check, Copy, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { discardPhoto, uploadMealPhoto } from "@/app/(app)/meals/actions";
import { Button, Card, CardTitle, LinkButton } from "@/components/ui";
import { downscaleImage } from "@/lib/client-image";

/**
 * Food photos waiting for Claude. The connector can't receive photos sent in Claude chat, so the
 * user saves them here instead; Claude reads them with list_new_photos / get_photo and log_meal
 * attaches each one to the meal it logs.
 */
export function ClaudePhotos({
  username,
  date,
  photos,
  readOnly,
}: {
  username: string;
  date: string;
  photos: { id: string; url: string }[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const prompt = `Ghi bữa ăn từ ảnh mới trong BodyMetrics cho hồ sơ ${username}`;

  async function upload(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length || busy.current) return;
    busy.current = true;
    setUploading(true);
    setError(null);
    try {
      for (const file of picked) {
        const form = new FormData();
        form.append("photo", await downscaleImage(file));
        form.append("date", date);
        const res = await uploadMealPhoto(form);
        if (!res.ok) {
          setError(res.error);
          break;
        }
      }
      router.refresh();
    } catch {
      setError("Không gửi được ảnh. Ảnh có thể quá lớn hoặc mạng không ổn định.");
    } finally {
      busy.current = false;
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  function remove(id: string) {
    if (!confirm("Bỏ ảnh này? Claude sẽ không thấy ảnh nữa.")) return;
    startRemoving(async () => {
      await discardPhoto(id);
      router.refresh();
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Không sao chép được, hãy gõ câu trên vào chat Claude.");
    }
  }

  return (
    <Card>
      <CardTitle>Gửi ảnh cho Claude</CardTitle>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void upload(e.target.files)} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />

      {photos.length > 0 ? (
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {photos.map((p) => (
              <div key={p.id} className="relative shrink-0">
                <Image src={p.url} alt="Ảnh chờ Claude" width={160} height={160} unoptimized className="size-24 rounded-xl object-cover" />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={removing}
                    aria-label="Bỏ ảnh"
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mb-3 rounded-xl bg-surface-2 p-3 text-sm">
            <p className="flex gap-2 text-muted">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                {photos.length} ảnh đang chờ. Mở chat Claude (đã bật BodyMetrics connector) và nói:
              </span>
            </p>
            <p className="mt-2 rounded-lg border border-border bg-surface px-3 py-2 font-medium">{prompt}</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="secondary" onClick={() => void copy()} className="w-full sm:w-auto">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Đã chép" : "Chép câu này"}
              </Button>
              <LinkButton href="https://claude.ai/new" target="_blank" rel="noreferrer" variant="secondary" className="w-full sm:w-auto">
                Mở chat Claude
              </LinkButton>
            </div>
            <p className="mt-2 text-xs text-muted">Claude tự xem ảnh, ghi bữa và gắn ảnh vào bữa đó. Ảnh chưa dùng sẽ tự xóa sau 3 ngày.</p>
          </div>
        </>
      ) : (
        <p className="mb-3 text-sm text-muted">
          Chụp món ăn ở đây rồi nhờ Claude ghi: Claude tự phân tích ảnh, ghi bữa và gắn ảnh vào bữa, không cần thao tác thêm.
        </p>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => cameraRef.current?.click()} disabled={uploading}>
            <Camera className="size-4" /> Chụp ảnh
          </Button>
          <Button type="button" variant="secondary" onClick={() => libraryRef.current?.click()} disabled={uploading}>
            <ImagePlus className="size-4" /> Chọn ảnh
          </Button>
          {uploading && (
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Đang tải ảnh…
            </span>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
