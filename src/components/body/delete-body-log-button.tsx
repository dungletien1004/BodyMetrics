"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deleteBodyLog } from "@/app/body/actions";
import { Button } from "@/components/ui";

export function DeleteBodyLogButton({ id, hasPhotos }: { id: string; hasPhotos: boolean }) {
  const [pending, start] = useTransition();
  const onClick = () => {
    if (!confirm(hasPhotos ? "Xóa lần ghi này cùng ảnh của nó?" : "Xóa lần ghi này?")) return;
    const form = new FormData();
    form.set("id", id);
    start(() => deleteBodyLog(form));
  };
  return (
    <Button type="button" variant="danger" className="px-2" aria-label="Xóa" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  );
}
