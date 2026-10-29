"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deleteMeal } from "@/app/meals/actions";
import { Button, cn } from "@/components/ui";

export function DeleteMealButton({ id, redirectTo, compact }: { id: string; redirectTo?: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const onClick = () => {
    if (!confirm("Xóa bữa ăn này cùng ảnh của nó?")) return;
    start(() => deleteMeal(id, redirectTo));
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
