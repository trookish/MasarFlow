import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ContextMenuItem {
  /** Discriminant — omit for a regular item, use "separator" for a divider. */
  type?: "item" | "separator";
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}

export type TerminalContextMenuItem =
  | { type: "separator" }
  | (ContextMenuItem & { type?: "item" });

interface TerminalContextMenuProps {
  x: number;
  y: number;
  items: TerminalContextMenuItem[];
  onClose: () => void;
}

/**
 * Minimal right-click context menu for the terminal. Fixed-position, closes on
 * outside click, Escape, or scroll, and flips near the window edges so it
 * never overflows off-screen (the terminal sits at the bottom of the window).
 */
export function TerminalContextMenu({ x, y, items, onClose }: TerminalContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - 4) nx = window.innerWidth - rect.width - 4;
    if (ny + rect.height > window.innerHeight - 4) ny = Math.max(4, window.innerHeight - rect.height - 4);
    setPos({ x: Math.max(4, nx), y: Math.max(4, ny) });
  }, [x, y]);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = (): void => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onScroll);
    };
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onMouseDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((item, i) =>
          item.type === "separator" ? (
            <div key={i} className="my-1 h-px bg-border" role="separator" />
          ) : (
            <button
              key={i}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors",
                item.disabled
                  ? "cursor-default text-muted-foreground/40"
                  : item.destructive
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-foreground hover:bg-accent/60",
              )}
            >
              {item.icon && (
                <span className="h-3.5 w-3.5 shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
                  {item.icon}
                </span>
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <kbd className="text-[10px] text-muted-foreground/70">{item.shortcut}</kbd>
              )}
            </button>
          ),
        )}
      </div>
    </>
  );
}
