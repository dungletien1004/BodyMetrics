"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="grid size-9 shrink-0 place-items-center rounded-xl border border-border hover:bg-surface-2"
      aria-label="Sao chép URL"
    >
      {copied ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
    </button>
  );
}
