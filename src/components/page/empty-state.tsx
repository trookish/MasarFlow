import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { KeyHint } from "./key-hint";

/**
 * What a page shows before it has anything to show. One sentence says what the page is for, one
 * button says what to do about it, and a shortcut (when there is one) teaches the fast path.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  shortcuts,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Shortcuts that do the same thing as the action, shown as keys. */
  shortcuts?: string[][];
  className?: string;
  /** 24 px padding instead of 64: for an empty panel inside a filled page. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact ? "px-4 py-6" : "px-6 py-16",
        className,
      )}
    >
      {Icon ? (
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      ) : null}
      <div className="max-w-sm space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
      {shortcuts?.length ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1">
          {shortcuts.map((keys) => (
            <KeyHint key={keys.join("+")} keys={keys} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
