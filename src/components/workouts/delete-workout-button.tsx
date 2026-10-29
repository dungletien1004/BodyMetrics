"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deleteWorkout } from "@/app/(app)/workouts/actions";
import { Button, cn } from "@/components/ui";

export function DeleteWorkoutButton({
  id,
  redirectTo,
  compact = false,
}: {
  id: string;
  redirectTo?: string;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const onClick = () => {
    if (!window.confirm("Xoá buổi tập này?")) return;
    start(() => deleteWorkout(id, redirectTo));
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label="Xoá buổi tập"
        className={cn("rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger", pending && "opacity-50")}
      >
        <Trash2 className="size-4" />
      </button>
    );
  }
  return (
    <Button type="button" variant="danger" onClick={onClick} disabled={pending}>
      <Trash2 className="size-4" /> {pending ? "Đang xoá…" : "Xoá"}
    </Button>
  );
}
