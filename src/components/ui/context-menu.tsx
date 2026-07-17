"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A positioned context menu, opened at arbitrary screen coordinates (from a
 * `contextmenu` event) rather than anchored to a trigger. Renders in a
 * portal-free fixed overlay, clamped to the viewport so it never spills past
 * a window edge. Closes on outside click / Escape / scroll.
 *
 * Coords are `{ x, y } | null`; when null, nothing renders. The parent owns
 * the open state and passes `onClose`.
 */

interface Coords {
  x: number;
  y: number;
}

export function ContextMenu({
  coords,
  onClose,
  children,
  className,
}: {
  coords: Coords | null;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Clamp into the viewport by mutating the element's position directly in a
  // layout effect (runs before paint, so no flash). Avoids setState-in-effect.
  React.useLayoutEffect(() => {
    if (!coords || !ref.current) return;
    const el = ref.current;
    const w = el.offsetWidth || 200;
    const h = el.offsetHeight || 240;
    el.style.left = Math.max(8, Math.min(coords.x, window.innerWidth - w - 8)) + "px";
    el.style.top = Math.max(8, Math.min(coords.y, window.innerHeight - h - 8)) + "px";
  }, [coords]);

  React.useEffect(() => {
    if (!coords) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onScroll() {
      onClose();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [coords, onClose]);

  if (!coords) return null;

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: coords.x, top: coords.y }}
      className={cn(
        "fixed z-[100] min-w-[12.5rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ContextMenuItem({
  children,
  onSelect,
  className,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  className?: string;
  disabled?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50"
          : variant === "destructive"
            ? "text-destructive hover:bg-destructive/10"
            : "hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}

export function ContextMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}
