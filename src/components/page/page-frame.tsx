import type { ReactNode } from "react";
import type { Archetype } from "@/lib/ui/archetype";
import { cn } from "@/lib/utils/cn";

export type { Archetype };

/**
 * The outer frame of a page: full height, no scroll of its own, one `data-archetype` attribute for
 * styling and for the shell, and a stack of PageHeader / Toolbar / body inside.
 */
export function PageFrame({
  archetype,
  children,
  className,
  "data-testid": testId,
}: {
  archetype: Archetype;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-archetype={archetype}
      data-testid={testId}
      className={cn("flex h-full min-h-0 min-w-0 flex-col", className)}
    >
      {children}
    </div>
  );
}

/** The scrolling region under a header or toolbar. */
export function PageBody({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  /** 16 px gutters (default) or flush, for boards and canvases that own their own edges. */
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-auto scrollbar-thin",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A non-scrolling region that fills the rest of the page (boards, canvases, editors). */
export function PageStage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative min-h-0 min-w-0 flex-1", className)}>
      {children}
    </div>
  );
}
