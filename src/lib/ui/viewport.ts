/**
 * Window-width classes for layout decisions. Three modes only, so behaviour is
 * predictable and testable:
 *   compact  (< 1024)  the sidebar collapses to icons; one tab fills the view
 *   regular  (1024+)   full sidebar and tab strip (a 1366 px laptop lands here)
 *   wide     (1680+)   extra room beside the content for the inspector
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

export type ViewportMode = "compact" | "regular" | "wide";

export const COMPACT_MAX = 1023;
export const WIDE_MIN = 1680;

export function viewportMode(width: number): ViewportMode {
  if (width <= COMPACT_MAX) return "compact";
  if (width >= WIDE_MIN) return "wide";
  return "regular";
}
