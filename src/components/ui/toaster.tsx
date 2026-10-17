"use client";

/**
 * Toast stack: bottom-right, above the floating nav dock, announced politely
 * to screen readers. Renders nothing when empty.
 */

import { Undo2, X } from "lucide-react";
import { useToastStore } from "@/lib/stores/toast";
import { cn } from "@/lib/utils/cn";

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-28 z-[60] flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-popover p-3 text-sm shadow-xl",
            toast.tone === "danger" && "border-destructive/40",
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">{toast.title}</p>
            {toast.description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{toast.description}</p>
            ) : null}
          </div>
          {toast.onAction && toast.actionLabel ? (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                dismiss(toast.id);
              }}
              className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
            >
              <Undo2 className="h-3 w-3" />
              {toast.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Dismiss notification: ${toast.title}`}
            onClick={() => dismiss(toast.id)}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
