import { cn } from "@/lib/utils/cn";

/** A quiet placeholder block; the shell only shows these while live data loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted", className)}
    />
  );
}

/** Rows that match a list's real height, so the list does not jump when data arrives. */
export function SkeletonRows({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-1 p-2", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex min-h-[var(--row-h)] items-center gap-3 rounded-md px-2"
          style={{ opacity: 1 - i * 0.08 }}
        >
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

/** A grid of card placeholders for board and dashboard pages. */
export function SkeletonCards({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-3">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}
