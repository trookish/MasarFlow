import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The filter and view row under a page header. One height, one gutter, scrolls sideways on narrow
 * windows instead of wrapping into a second row that shifts the content below it.
 */
export function Toolbar({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel ?? "Page toolbar"}
      className={cn(
        "flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A related run of controls inside the toolbar. */
export function ToolbarGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {children}
    </div>
  );
}

/** Pushes everything after it to the right edge. */
export function ToolbarSpacer() {
  return <div className="ml-auto" />;
}

export function ToolbarSeparator() {
  return <div aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />;
}

/** Small caption for the current filter ("3 filters"). */
export function ToolbarNote({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
      {children}
    </span>
  );
}
