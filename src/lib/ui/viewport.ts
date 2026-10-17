/**
 * Window-width classes for layout decisions. Three modes only, so behaviour is
 * predictable and testable:
 *   compact  (< 1024)  one panel at a time; the sidebar collapses to icons; the
 *                      dock's split layout is presented as a panel switcher
 *   regular  (1024+)   normal dock behaviour (a 1366 px laptop lands here)
 *   wide     (1680+)   room for 3 columns and floating windows by default
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
