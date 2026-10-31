"use client";

import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addMealPhotos, removeMealPhoto } from "@/app/(app)/meals/actions";
import { Button, Card, CardTitle } from "@/components/ui";
import { downscaleImage } from "@/lib/client-image";

/**
 * Photos of a saved meal: add more (camera or library) or remove one. Meals logged through the
 * Claude connector arrive without a photo, so this is where it gets attached afterwards.
 */
export function MealPhotos({ mealId, photos }: { mealId: string; photos: { id: string; url: string }[] }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function upload(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length || busy.current) return;
    busy.current = true;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      for (const f of await Promise.all(picked.map(downscaleImage))) form.append("photos", f);
      const res = await addMealPhotos(mealId, form);
      if (!res.ok) setError(res.error);
      else router.refresh();
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
    if (!confirm("Xóa ảnh này khỏi bữa ăn?")) return;
    startRemoving(async () => {
      await removeMealPhoto(id);
      router.refresh();
    });
  }

  return (
    // scroll-mt: opened from Claude's link (#anh-bua-an), keep the title clear of the sticky top bar.
    <Card id="anh-bua-an" className="scroll-mt-20">
      <CardTitle>Ảnh bữa ăn</CardTitle>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void upload(e.target.files)} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />

      {photos.length > 0 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {photos.map((p) => (
            <div key={p.id} className="relative shrink-0">
              <Image src={p.url} alt="Ảnh bữa ăn" width={320} height={240} unoptimized className="h-40 w-auto rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={removing}
                aria-label="Xóa ảnh"
                className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted">Bữa này chưa có ảnh. Thêm ảnh để xem lại sau, kể cả bữa đã ghi qua Claude.</p>
      )}

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
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
