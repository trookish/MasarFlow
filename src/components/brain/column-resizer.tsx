"use client";

import { useEffect, useState } from "react";

/** A sidebar column width persisted per key in localStorage. */
export function useColumnWidth(key: string, initial: number) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return initial;
    const n = Number(window.localStorage.getItem(`masarflow-col-${key}`));
    return Number.isFinite(n) && n > 0 ? n : initial;
  });
  useEffect(() => {
    window.localStorage.setItem(`masarflow-col-${key}`, String(width));
  }, [key, width]);
  return [width, setWidth] as const;
}

/** Thin vertical drag handle that reports horizontal deltas while dragged. */
export function ColumnResizer({ onDelta }: { onDelta: (dx: number) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/60 active:bg-primary"
      onPointerDown={(e) => {
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        let lastX = e.clientX;
        const onMove = (ev: PointerEvent) => {
          onDelta(ev.clientX - lastX);
          lastX = ev.clientX;
        };
        const onUp = () => {
          el.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        el.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
    />
  );
}
