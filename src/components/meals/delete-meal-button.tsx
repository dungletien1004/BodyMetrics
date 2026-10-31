"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRef, useTransition } from "react";
import { deleteMeal } from "@/app/(app)/meals/actions";
import { Button, cn } from "@/components/ui";

export function DeleteMealButton({ id, redirectTo, compact }: { id: string; redirectTo?: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  // A ref, not only `disabled`: a double tap fires twice before React re-renders.
  const lock = useRef(false);
  const onClick = () => {
    if (lock.current || !confirm("Xóa bữa ăn này cùng ảnh của nó?")) return;
    lock.current = true;
    start(async () => {
      try {
        await deleteMeal(id, redirectTo);
      } finally {
        // Without a redirect the row disappears on revalidation; release so a failure can be retried.
        lock.current = false;
      }
    });
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label="Xóa bữa ăn"
        className={cn("rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-50")}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </button>
    );
  }
  return (
    <Button type="button" variant="danger" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Xóa bữa ăn
    </Button>
  );
}
