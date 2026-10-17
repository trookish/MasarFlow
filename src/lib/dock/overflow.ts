/**
 * Tab-strip presentation math. A dock group can hold any number of panels;
 * the strip scrolls, the active tab is always scrolled into view, and past
 * TAB_MENU_THRESHOLD the group also offers an explicit "All tabs" menu so no
 * panel is ever unreachable (the user's rule: nothing hidden, everything
 * discoverable).
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

/** Above this many tabs in one group, show the "All tabs (N)" menu as well. */
export const TAB_MENU_THRESHOLD = 8;

/** How many tabs are to the left/right of the active one. */
export function tabCounts(
  count: number,
  activeIndex: number,
): { before: number; after: number } {
  if (count <= 0) return { before: 0, after: 0 };
  const active = Math.max(0, Math.min(activeIndex, count - 1));
  return { before: active, after: count - 1 - active };
}

/** True when the strip is crowded enough to also offer the overflow menu. */
export function shouldUseTabMenu(count: number): boolean {
  return count >= TAB_MENU_THRESHOLD;
}
