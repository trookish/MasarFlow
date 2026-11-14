import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The one header a page gets. The surface and section names already sit in the tab strip and the
 * section switcher, so a page names *itself* here and never repeats the surface description: one
 * heading, one line of context, the page's actions on the right.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  meta,
  actions,
  className,
}: {
  title: string;
  /** One line, cut with an ellipsis; the full text is the tooltip. */
  description?: string;
  icon?: LucideIcon;
  /** Badges or counts beside the title, e.g. "12 open". */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-4",
        className,
      )}
    >
      {Icon ? (
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
      <h1
        className="min-w-0 shrink-0 truncate text-sm font-semibold"
        title={title}
      >
        {title}
      </h1>
      {meta ? (
        <div className="flex shrink-0 items-center gap-1.5">{meta}</div>
      ) : null}
      {description ? (
        <p
          className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block"
          title={description}
        >
          {description}
        </p>
      ) : null}
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
