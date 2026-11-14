/**
 * Widths for the resizable panes inside a page (Notes' folder · list · editor, a board's filter
 * rail). Kept pure so the clamping and the storage round-trip are testable without a DOM.
 */

export const PANE_MIN_WIDTH = 180;
export const PANE_MAX_WIDTH = 560;

export function clampPaneWidth(
  width: number,
  min = PANE_MIN_WIDTH,
  max = PANE_MAX_WIDTH,
): number {
  if (!Number.isFinite(width)) return min;
  return Math.min(max, Math.max(min, Math.round(width)));
}

/** `storageKey` for a page's pane, namespaced so two pages cannot collide. */
export function paneStorageKey(page: string, pane: string): string {
  return `masarflow-pane:${page}:${pane}`;
}

export function parsePaneWidth(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? clampPaneWidth(n) : fallback;
}
