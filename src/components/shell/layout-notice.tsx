"use client";

import { LayoutPanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/stores/ui";

/** One-time notice for users moved from the dock to the standard layout by the 0.3 migration. */
export function LayoutNotice() {
  const seen = useUIStore((s) => s.layoutNoticeSeen);
  const dismiss = useUIStore((s) => s.dismissLayoutNotice);
  const setLayoutMode = useUIStore((s) => s.setLayoutMode);
  if (seen) return null;
  return (
    <div
      role="status"
      aria-label="Layout notice"
      className="flex items-center gap-3 border-b border-border bg-accent/40 px-4 py-2 text-xs"
    >
      <LayoutPanelLeft className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1">
        MasarFlow now opens in the standard layout with six surfaces. The tiled panel layout is still available as
        the Studio layout under Settings, Interface.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setLayoutMode("studio");
          dismiss();
        }}
      >
        Use Studio layout
      </Button>
      <button type="button" aria-label="Dismiss layout notice" className="rounded p-1 hover:bg-accent" onClick={dismiss}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}
