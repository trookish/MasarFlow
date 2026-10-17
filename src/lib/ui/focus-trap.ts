/**
 * Focus-trap math for modal overlays. The dialogs in this app already have
 * role="dialog", aria-modal, Escape and a body scroll lock (src/components/ui/
 * dialog.tsx); what they do NOT have is a focus trap, which is the one thing
 * that actually keeps a keyboard user inside an overlay. This module holds the
 * arithmetic; useFocusTrap (src/lib/hooks/use-focus-trap.ts) holds the DOM.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

/** Focusables inside a trap, in DOM order. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Index to move to when stepping `delta` (+1 Tab, -1 Shift+Tab) from `current`
 * within `count` focusables, wrapping at both ends. -1 when there is nothing
 * to focus (the caller must then prevent the default and keep focus where it is).
 */
export function stepIndex(current: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return -1;
  const from = current < 0 || current >= count ? (delta === 1 ? -1 : 0) : current;
  return (from + delta + count) % count;
}
