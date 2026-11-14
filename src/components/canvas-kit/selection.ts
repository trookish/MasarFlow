import type { Point, Rect } from "./viewport-math";

/** How a click or marquee combines with the existing selection. */
export type SelectMode = "replace" | "toggle" | "add";

/** The selection mode a pointer event asks for: shift adds, ctrl/cmd toggles, plain replaces. */
export function selectModeFromEvent(e: {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): SelectMode {
  if (e.ctrlKey || e.metaKey) return "toggle";
  if (e.shiftKey) return "add";
  return "replace";
}

export type IdSet = ReadonlySet<string>;

export const EMPTY_SELECTION: IdSet = new Set<string>();

/** Apply a click on `id`. Never mutates `current`. */
export function applyClick(current: IdSet, id: string, mode: SelectMode): IdSet {
  if (mode === "replace") return current.size === 1 && current.has(id) ? current : new Set([id]);
  const next = new Set(current);
  if (mode === "toggle" && next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAll(ids: Iterable<string>): IdSet {
  return new Set(ids);
}

/** Drop ids that no longer exist (a node was filtered out or deleted). Returns `current` when unchanged. */
export function pruneSelection(current: IdSet, exists: (id: string) => boolean): IdSet {
  let changed = false;
  const next = new Set<string>();
  for (const id of current) {
    if (exists(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : current;
}

/** Combine a marquee's hits with the selection that existed when the drag began. */
export function applyMarquee(base: IdSet, hits: Iterable<string>, mode: SelectMode): IdSet {
  const hitSet = new Set(hits);
  if (mode === "replace") return hitSet;
  const next = new Set(base);
  for (const id of hitSet) {
    if (mode === "toggle" && base.has(id)) next.delete(id);
    else next.add(id);
  }
  return next;
}

/** A rectangle from two opposite corners, in any order. */
export function rectFromCorners(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Ids of the points inside the marquee rectangle. */
export function hitTestPoints<T extends Point>(
  items: Iterable<T & { id: string }>,
  marquee: Rect,
): string[] {
  const out: string[] = [];
  for (const it of items) if (rectContainsPoint(marquee, it)) out.push(it.id);
  return out;
}

export interface RectItem extends Rect {
  id: string;
}

/** Ids of the rectangles the marquee touches (`intersect`) or fully encloses (`contain`). */
export function hitTestRects(
  items: Iterable<RectItem>,
  marquee: Rect,
  how: "intersect" | "contain" = "intersect",
): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (how === "contain" ? rectContainsRect(marquee, it) : rectsIntersect(marquee, it)) out.push(it.id);
  }
  return out;
}

export interface CircleItem extends Point {
  id: string;
  r: number;
}

/**
 * The topmost circle under a point: later items are drawn on top, so the last match wins.
 * `slop` widens every circle (in world units) so small targets stay clickable when zoomed out.
 */
export function pickCircle(items: ReadonlyArray<CircleItem>, p: Point, slop = 0): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const dx = it.x - p.x;
    const dy = it.y - p.y;
    const r = it.r + slop;
    if (dx * dx + dy * dy <= r * r) return it.id;
  }
  return null;
}
