"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/** Refresh the server-rendered connector grant list after returning from Claude, or on demand. */
export function RefreshConnectionStatus() {
  const router = useRouter();

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  return (
    <Button type="button" variant="secondary" onClick={() => router.refresh()} className="px-3 py-2 text-xs">
      <RefreshCw className="size-3.5" /> Cập nhật trạng thái
    </Button>
  );
}
