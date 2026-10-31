"use client";

import { Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
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
  // A ref so a double tap (or a second tap behind the confirm dialog) can't fire twice.
  const lock = useRef(false);
  const [locked, setLocked] = useState(false);
  const busy = pending || locked;

  const onClick = () => {
    if (lock.current || !window.confirm("Xoá buổi tập này?")) return;
    lock.current = true;
    setLocked(true);
    start(async () => {
      try {
        await deleteWorkout(id, redirectTo);
      } finally {
        // Redirecting away: stay locked until the page changes. In a list, the row disappears.
        if (!redirectTo) {
          lock.current = false;
          setLocked(false);
        }
      }
    });
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label="Xoá buổi tập"
        className={cn("rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger", busy && "opacity-50")}
      >
        <Trash2 className="size-4" />
      </button>
    );
  }
  return (
    <Button type="button" variant="danger" onClick={onClick} disabled={busy}>
      <Trash2 className="size-4" /> {busy ? "Đang xoá…" : "Xoá"}
    </Button>
  );
}
