/**
 * Drop-zone geometry for the MasarFlow dock window manager.
 *
 * Pure math only — classifies a pointer position against a measured element
 * rect and computes split-preview rectangles for the docking overlay.
 * No React, Next, or DOM imports.
 */

import type { DockZone } from "./types";
import { MAX_RATIO, MIN_RATIO } from "./types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Minimum edge-band size in px: rects smaller than this are all "tab". */
const MIN_EDGE_PX = 40;

/**
 * Classify a pointer position against `rect`:
 * - center band (not within edgeFraction of any edge) -> "tab"
 * - within edgeFraction of an edge -> that zone; corner overlaps resolve to
 *   the NEAREST edge by distance
 * - a rect with a dimension < 40px is degenerate and always yields "tab"
 */
export function zoneForPoint(
  rect: Rect,
  px: number,
  py: number,
  edgeFraction = 0.28,
): DockZone {
  const edgeW = rect.width * edgeFraction;
  const edgeH = rect.height * edgeFraction;
  const relX = px - rect.x;
  const relY = py - rect.y;

  if (rect.width < MIN_EDGE_PX || rect.height < MIN_EDGE_PX) return "tab";
  if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) {
    return "tab"; // outside the rect entirely — not a docking target
  }

  const nearLeft = relX < edgeW;
  const nearRight = relX > rect.width - edgeW;
  const nearTop = relY < edgeH;
  const nearBottom = relY > rect.height - edgeH;

  if (!nearLeft && !nearRight && !nearTop && !nearBottom) return "tab";

  // Corner overlap: resolve to the nearest edge by distance.
  const dists: Array<[DockZone, number]> = [];
  if (nearLeft) dists.push(["left", relX]);
  if (nearRight) dists.push(["right", rect.width - relX]);
  if (nearTop) dists.push(["top", relY]);
  if (nearBottom) dists.push(["bottom", rect.height - relY]);
  dists.sort((a, b) => a[1] - b[1]);
  return dists[0][0];
}

/**
 * Preview rect for a split drop: the portion of `rect` the incoming panel
 * would occupy. Null for the "tab" zone (the preview is the tab strip).
 */
export function splitPreviewRect(
  rect: Rect,
  zone: DockZone,
  ratio = 0.5,
): Rect | null {
  const r = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  switch (zone) {
    case "left":
      return { x: rect.x, y: rect.y, width: rect.width * r, height: rect.height };
    case "right":
      return {
        x: rect.x + rect.width * r,
        y: rect.y,
        width: rect.width * (1 - r),
        height: rect.height,
      };
    case "top":
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height * r };
    case "bottom":
      return {
        x: rect.x,
        y: rect.y + rect.height * r,
        width: rect.width,
        height: rect.height * (1 - r),
      };
    case "tab":
      return null;
  }
}

/** Clamp a split ratio into [MIN_RATIO, MAX_RATIO]. */
export function clampRatio(r: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
}

/** Shift a rect by (dx, dy). */
export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
}
