"use client";

/**
 * Draggable split divider. Live-resizes the owning split via pointer capture;
 * double-click resets to 50/50; Arrow keys (Shift = coarse, Home/End = limit)
 * resize it from the keyboard, and it exposes the ARIA window-splitter
 * attributes so the ratio is audible and testable. The ratio math uses the
 * parent split element's rect, so it works at any nesting depth.
 */

import { useCallback, useRef } from "react";
import { MIN_RATIO, MAX_RATIO } from "@/lib/dock/types";
import { clampRatio, resizeDelta } from "@/lib/dock/geometry";
import { useDockStore } from "@/lib/stores/dock";
import { cn } from "@/lib/utils/cn";

export function SplitDivider({
  direction,
  splitId,
  ratio,
}: {
  direction: "horizontal" | "vertical";
  splitId: string;
  /** Current share of the FIRST pane (0.05 – 0.95) — required for ARIA + keys. */
  ratio: number;
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
      tabIndex={0}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label={horizontal ? "Resize columns" : "Resize rows"}
      aria-valuemin={Math.round(MIN_RATIO * 100)}
      aria-valuemax={Math.round(MAX_RATIO * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuetext={`${Math.round(ratio * 100)}% for the first pane`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resize(splitId, 0.5)}
      onKeyDown={(e) => {
        const delta = resizeDelta(e.key, direction, e.shiftKey);
        if (delta === null) return;
        e.preventDefault();
        resize(splitId, clampRatio(ratio + delta));
      }}
      title="Drag to resize · double-click for 50/50 · arrow keys to nudge"
      className={cn(
        "group relative z-10 shrink-0 bg-border transition-colors hover:bg-primary/60 focus-visible:bg-primary/60 focus-visible:outline-none",
        horizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      )}
    >
      {/* Wider invisible hit area: a 1px line is not a pointer target. */}
      <span
        aria-hidden
        className={cn(
          "absolute",
          horizontal ? "-left-1 -right-1 top-0 bottom-0" : "-top-1 -bottom-1 left-0 right-0",
        )}
      />
    </div>
  );
}
