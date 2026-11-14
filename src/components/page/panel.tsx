import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ScrollArea } from "@/components/ui/scroll-area";

/** A bordered surface for one topic: a card that carries its own title bar and scroll region. */
export function Panel({
  children,
  className,
  "data-testid": testId,
}: {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn(
        "flex min-h-0 min-w-0 flex-col rounded-lg border border-border bg-card/60",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  icon: Icon,
  count,
  actions,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  /** Optional count shown beside the title as a quiet badge. */
  count?: number | string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 border-b border-border px-3",
        className,
      )}
    >
      {Icon ? (
        <Icon
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : null}
      <h2 className="min-w-0 truncate text-xs font-semibold tracking-wide uppercase">
        {title}
      </h2>
      {count !== undefined ? (
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {count}
        </span>
      ) : null}
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** The scrolling body of a panel. */
export function PanelBody({
  children,
  className,
  scroll = true,
}: {
  children: ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  if (!scroll)
    return <div className={cn("min-h-0 flex-1", className)}>{children}</div>;
  return (
    <ScrollArea className={cn("min-h-0 flex-1", className)}>
      {children}
    </ScrollArea>
  );
}

export function PanelFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-t border-border px-3 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
