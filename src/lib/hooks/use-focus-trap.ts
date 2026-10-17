"use client";

/**
 * Focus trap + restore for overlays (the palette and the global search).
 * - on open: remembers document.activeElement and moves focus into the trap
 *   (the first focusable, unless the container already contains focus);
 * - Tab / Shift+Tab: wraps inside the container (stepIndex);
 * - on close: restores focus to what was focused before, so the keyboard user
 *   lands back where they were instead of at the top of the document.
 */

import { useEffect, type RefObject } from "react";
import { FOCUSABLE_SELECTOR, stepIndex } from "@/lib/ui/focus-trap";

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      );

    const first = focusables()[0];
    if (first && !container.contains(document.activeElement)) first.focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = stepIndex(current, items.length, e.shiftKey ? -1 : 1);
      e.preventDefault();
      items[next]?.focus();
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active, ref]);
}
