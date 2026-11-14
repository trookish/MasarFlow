"use client";

import { useCallback, useRef, useState } from "react";

/** The live content width of an element, via ResizeObserver (0 until measured). */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    setWidth(Math.round(node.getBoundingClientRect().width));
    const ro = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (prev === next ? prev : next));
    });
    ro.observe(node);
    observer.current = ro;
  }, []);
  return [ref, width];
}
