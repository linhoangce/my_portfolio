"use client";

import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { useGame } from "../store";

/** One toast at a time, top centre, auto-dismissed. Screen readers get the aria-live region in the HUD instead. */
export function Toasts() {
  const toast = useGame((s) => s.toast);
  const clearToast = useGame((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const timer = window.setTimeout(() => clearToast(id), 4200);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-36 flex justify-center px-4 sm:top-6">
      <div
        key={toast.id}
        aria-hidden="true"
        className={cn(
          "glass max-w-md animate-[toast-in_0.35s_ease-out] px-4 py-2.5 text-center text-sm",
          toast.tone === "success" && "border-cyan/50 text-cyan",
          toast.tone === "warn" && "border-lamp/50 text-lamp",
          toast.tone === "info" && "text-fg",
        )}
      >
        {toast.text}
      </div>
    </div>
  );
}
