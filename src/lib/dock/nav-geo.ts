/**
 * Spatial geometry for keyboard navigation: where each group sits in the
 * workspace, and which group lies in a given direction. Ratios are used
 * directly (no DOM measuring), so the result is deterministic and testable;
 * the caller supplies the workspace rect.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode } from "./types";
import type { Rect } from "./geometry";
import { findNode } from "./tree";

export type Direction = "left" | "right" | "up" | "down";

/** Slot rect of every focusable node (page/tabs leaves), keyed by node id. */
export function layoutRects(
  tree: DockNode,
  rect: Rect,
  out: Map<string, Rect> = new Map(),
): Map<string, Rect> {
  if (tree.type === "split") {
    const horizontal = tree.direction === "horizontal";
    const firstSize = horizontal ? rect.width * tree.ratio : rect.height * tree.ratio;
    const first: Rect = horizontal
      ? { x: rect.x, y: rect.y, width: firstSize, height: rect.height }
      : { x: rect.x, y: rect.y, width: rect.width, height: firstSize };
    const second: Rect = horizontal
      ? {
          x: rect.x + firstSize,
          y: rect.y,
          width: rect.width - firstSize,
          height: rect.height,
        }
      : {
          x: rect.x,
          y: rect.y + firstSize,
          width: rect.width,
          height: rect.height - firstSize,
        };
    layoutRects(tree.children[0], first, out);
    layoutRects(tree.children[1], second, out);
    return out;
  }
  out.set(tree.id, rect);
  return out;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * The node to focus when moving `fromId` in `dir`.
 * Candidates must lie beyond the source's edge on the movement axis (1px
 * tolerance for shared borders) and overlap the source on the other axis, so
 * "left" never jumps to a diagonally placed group. Nearest gap wins, ties
 * break on how well the two centres line up.
 */
export function neighborInDirection(
  rects: Map<string, Rect>,
  fromId: string,
  dir: Direction,
): string | null {
  const from = rects.get(fromId);
  if (!from) return null;
  const horizontal = dir === "left" || dir === "right";

  const candidates: Array<{ id: string; gap: number; off: number }> = [];
  for (const [id, rect] of rects) {
    if (id === fromId) continue;

    const gap = horizontal
      ? dir === "left"
        ? from.x - (rect.x + rect.width)
        : rect.x - (from.x + from.width)
      : dir === "up"
        ? from.y - (rect.y + rect.height)
        : rect.y - (from.y + from.height);
    if (gap < -1) continue;

    const overlapPx = horizontal
      ? overlap(from.y, from.y + from.height, rect.y, rect.y + rect.height)
      : overlap(from.x, from.x + from.width, rect.x, rect.x + rect.width);
    if (overlapPx <= 0) continue;

    const off = horizontal
      ? Math.abs(rect.y + rect.height / 2 - (from.y + from.height / 2))
      : Math.abs(rect.x + rect.width / 2 - (from.x + from.width / 2));
    candidates.push({ id, gap, off });
  }

  candidates.sort((a, b) =>
    Math.abs(a.gap - b.gap) <= 1 ? a.off - b.off : a.gap - b.gap,
  );
  return candidates.length > 0 ? candidates[0].id : null;
}

/** The panel to focus after moving into `nodeId` (first page of that group). */
export function focusTargetOf(tree: DockNode, nodeId: string): string | null {
  const node = findNode(tree, nodeId);
  if (!node) return null;
  if (node.type === "page") return node.pageId;
  if (node.type === "tabs") return node.activePage;
  return null;
}
