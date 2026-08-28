"use client";

/**
 * Draggable split divider. Live-resizes the owning split via pointer
 * capture; double-click resets to 50/50. The ratio math uses the parent
 * split element's rect, so it works at any nesting depth.
 */

import { useCallback, useRef } from "react";
import { clampRatio } from "@/lib/dock/geometry";
import { useDockStore } from "@/lib/stores/dock";
import { cn } from "@/lib/utils/cn";

export function SplitDivider({
  direction,
  splitId,
}: {
  direction: "horizontal" | "vertical";
  splitId: string;
}) {
  const resize = useDockStore((s) => s.resize);
  const ref = useRef<HTMLDivElement>(null);
  const horizontal = direction === "horizontal";

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = ref.current;
      const parent = el?.parentElement;
      if (!el || !parent) return;
      const rect = parent.getBoundingClientRect();
      el.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const frac = horizontal
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
        resize(splitId, clampRatio(frac));
      };
      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [horizontal, resize, splitId],
  );

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resize(splitId, 0.5)}
      className={cn(
        "group relative z-10 shrink-0 bg-border transition-colors hover:bg-primary/60",
        horizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      )}
    />
  );
}
