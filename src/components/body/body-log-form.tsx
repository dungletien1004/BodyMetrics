"use client";

import { ImagePlus } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { addBodyLog, type BodyFormState } from "@/app/(app)/body/actions";
import { Button, Field, Input } from "@/components/ui";
import { downscaleImage } from "@/lib/client-image";

export function BodyLogForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<BodyFormState, FormData>(addBodyLog, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [resizing, setResizing] = useState(false);
  // Set synchronously on submit so a fast double tap can't send twice before `pending` renders.
  const busy = useRef(false);

  // Shrink photos in the browser first so the upload stays under the host's request limit.
  async function submit(form: FormData) {
    if (busy.current) return;
    busy.current = true;
    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    form.delete("photos");
    setResizing(true);
    try {
      for (const f of await Promise.all(files.map(downscaleImage))) form.append("photos", f);
    } finally {
      setResizing(false);
    }
    // After the await we are outside the form's transition, so start one for the action.
    startTransition(() => action(form));
  }

  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setPreviews([]);
    }
  }, [state]);

  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  return (
    <form ref={formRef} action={submit} className="grid grid-cols-2 gap-3">
      <Field label="Ngày" className="col-span-2">
        <Input name="date" type="date" defaultValue={today} max={today} required />
      </Field>
      <Field label="Cân nặng (kg)">
        <Input name="weightKg" type="number" step="0.1" inputMode="decimal" placeholder="72,4" />
      </Field>
      <Field label="Vòng eo (cm)">
        <Input name="waistCm" type="number" step="0.1" inputMode="decimal" />
      </Field>
      <Field label="% mỡ cơ thể">
        <Input name="bodyFatPct" type="number" step="0.1" inputMode="decimal" />
      </Field>
      <Field label="Ghi chú">
        <Input name="note" placeholder="Cân sáng, sau WC" />
      </Field>

      <label className="col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border p-3 text-sm text-muted hover:bg-surface-2">
        <ImagePlus className="size-5 text-accent" />
        <span>Ảnh tiến trình (tùy chọn)</span>
        <input
          name="photos"
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => setPreviews(Array.from(e.target.files ?? []).map((f) => URL.createObjectURL(f)))}
        />
      </label>
      {previews.length > 0 && (
        <div className="col-span-2 flex gap-2 overflow-x-auto">
          {previews.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" />
          ))}
        </div>
      )}

      <div className="col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending || resizing}>
          {pending || resizing ? "Đang lưu…" : "Lưu"}
        </Button>
        {state && <span className={state.ok ? "text-sm text-accent" : "text-sm text-danger"}>{state.message}</span>}
      </div>
    </form>
  );
}
