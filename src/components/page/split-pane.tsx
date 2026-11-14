"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import {
  PANE_MAX_WIDTH,
  PANE_MIN_WIDTH,
  clampPaneWidth,
  paneStorageKey,
} from "@/lib/ui/pane-width";

const KEY_STEP = 16;

/**
 * Two panes with a draggable (and keyboard-resizable) divider. The width survives reloads, which is
 * what makes a three-pane page (Notes: folders · list · editor) feel like a tool rather than a
 * form. `side` sits at the left edge; `main` takes the rest.
 */
export function SplitPane({
  page,
  pane,
  side,
  main,
  defaultWidth = 280,
  min = PANE_MIN_WIDTH,
  max = PANE_MAX_WIDTH,
  label,
  className,
}: {
  /** Page id used in the storage key ("brain"), one per page. */
  page: string;
  /** Pane id inside that page ("folders", "list"). */
  pane: string;
  side: ReactNode;
  main: ReactNode;
  defaultWidth?: number;
  min?: number;
  max?: number;
  /** Accessible name of the divider, e.g. "Resize note list". */
  label: string;
  className?: string;
}) {
  const key = paneStorageKey(page, pane);
  const [width, setWidth] = useState(defaultWidth);

  // Read after mount, not during render: the server has no storage, so reading there would make
  // the first client paint disagree with the HTML.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one post-hydration read
      if (raw !== null) setWidth(clampPaneWidth(Number(raw), min, max));
    } catch {
      // Storage blocked: keep the default width.
    }
  }, [key, min, max]);

  const commit = useCallback(
    (value: number) => {
      const next = clampPaneWidth(value, min, max);
      setWidth(next);
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // Storage blocked: the width still applies for this session.
      }
    },
    [key, min, max],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) =>
        setWidth(clampPaneWidth(startWidth + (ev.clientX - startX), min, max));
      const up = (ev: PointerEvent) => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        commit(startWidth + (ev.clientX - startX));
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    },
    [width, min, max, commit],
  );

  return (
    <div className={cn("flex h-full min-h-0 min-w-0", className)}>
      <div className="flex shrink-0 flex-col" style={{ width }}>
        {side}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startDrag}
        onDoubleClick={() => commit(defaultWidth)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") commit(width + KEY_STEP);
          else if (e.key === "ArrowLeft") commit(width - KEY_STEP);
          else if (e.key === "Home") commit(defaultWidth);
          else return;
          e.preventDefault();
        }}
        className="group relative -ml-1 w-2 shrink-0 cursor-col-resize touch-none"
      >
        <div className="absolute inset-y-0 left-1 w-px bg-border transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary/60" />
      </div>
      <div className="min-w-0 flex-1">{main}</div>
    </div>
  );
}
