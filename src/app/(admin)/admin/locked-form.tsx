"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

/**
 * A form that sends once: a second submit fired before React re-renders with `pending` (double
 * tap, Enter then click) is dropped. It unlocks when the action finishes. An `onSubmit` that calls
 * preventDefault (e.g. a confirm()) leaves it unlocked.
 */
export function LockedForm({ onSubmit, children, ...props }: ComponentProps<"form">) {
  const locked = useRef(false);
  return (
    <form
      {...props}
      onSubmit={(e) => {
        if (locked.current) {
          e.preventDefault();
          return;
        }
        onSubmit?.(e);
        if (!e.defaultPrevented) locked.current = true;
      }}
    >
      <Unlock
        onIdle={() => {
          locked.current = false;
        }}
      />
      {children}
    </form>
  );
}

function Unlock({ onIdle }: { onIdle: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) onIdle();
    wasPending.current = pending;
  }, [pending, onIdle]);
  return null;
}
