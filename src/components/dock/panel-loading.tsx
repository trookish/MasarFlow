"use client";

/**
 * Panel loading state: a labelled skeleton instead of an anonymous spinner, so
 * a slow panel reads as "loading Task Boards", and screen readers hear it.
 */

export function PanelLoading({ label = "panel" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={`Loading ${label}`}
      className="flex h-full w-full flex-col gap-3 bg-background/50 p-4"
    >
      <div className="h-6 w-40 animate-pulse rounded bg-accent" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-accent/70" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-accent/70" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-accent/50" />
    </div>
  );
}
