"use client";

import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addMealPhotos, removeEntryPhoto } from "@/app/(app)/meals/actions";
import { addWorkoutPhotos } from "@/app/(app)/workouts/actions";
import { Button, Card, CardTitle } from "@/components/ui";
import { downscaleImage } from "@/lib/client-image";

const COPY = {
  meal: { anchor: "anh-bua-an", title: "Ảnh bữa ăn", empty: "Bữa này chưa có ảnh. Thêm ảnh để xem lại sau, kể cả bữa đã ghi qua Claude.", confirm: "Xóa ảnh này khỏi bữa ăn?" },
  workout: { anchor: "anh-buoi-tap", title: "Ảnh buổi tập", empty: "Buổi này chưa có ảnh. Thêm ảnh màn hình đồng hồ, máy chạy hoặc phòng tập.", confirm: "Xóa ảnh này khỏi buổi tập?" },
};

/**
 * Photos of a saved meal or workout: add more (camera or library) or remove one. Entries logged
 * through the Claude connector may arrive without a photo, so this is where it gets attached.
 */
export function EntryPhotos({ kind, id, photos }: { kind: "meal" | "workout"; id: string; photos: { id: string; url: string }[] }) {
  const copy = COPY[kind];
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
      const res = kind === "meal" ? await addMealPhotos(id, form) : await addWorkoutPhotos(id, form);
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

  function remove(photoId: string) {
    if (!confirm(copy.confirm)) return;
    startRemoving(async () => {
      await removeEntryPhoto(photoId);
      router.refresh();
    });
  }

  return (
    // scroll-mt: opened from Claude's link (#anh-bua-an / #anh-buoi-tap), keep the title clear of the sticky top bar.
    <Card id={copy.anchor} className="scroll-mt-20">
      <CardTitle>{copy.title}</CardTitle>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void upload(e.target.files)} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />

      {photos.length > 0 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {photos.map((p) => (
            <div key={p.id} className="relative shrink-0">
              <Image src={p.url} alt={copy.title} width={320} height={240} unoptimized className="h-40 w-auto rounded-xl object-cover" />
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
        <p className="mb-3 text-sm text-muted">{copy.empty}</p>
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
