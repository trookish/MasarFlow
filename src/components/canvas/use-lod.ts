"use client";

import { useStore } from "@xyflow/react";

/**
 * Level-of-detail hook for canvas nodes.
 *
 * Returns `true` when the viewport zoom is below the LOD threshold, meaning
 * nodes should render simplified previews instead of full interactive content.
 *
 * Uses RF's internal store with a boolean selector — zustand only re-renders
 * the subscriber when the boolean *changes* (false→true or true→false), so
 * nodes don't re-render on every zoom step, only when crossing the threshold.
 *
 * This is the single biggest performance win for large canvases: at low zoom,
 * hundreds of nodes show lightweight labels instead of mounting CodeMirror
 * editors, iframes, and media players.
 */
export function useIsLowDetail(threshold: number): boolean {
  return useStore((s) => s.transform[2] < threshold);
}
