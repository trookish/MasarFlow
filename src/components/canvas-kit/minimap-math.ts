import {
  boundsOfRects,
  inflateRect,
  visibleWorldRect,
  type Point,
  type Rect,
  type Size,
  type Viewport,
} from "./viewport-math";

/** How a world rectangle is laid out inside a minimap of a given pixel size. */
export interface MinimapTransform {
  scale: number;
  /** Minimap-space position of the world origin. */
  ox: number;
  oy: number;
  /** The world rectangle the minimap shows. */
  world: Rect;
}

/**
 * The world area a minimap shows: everything the scene contains plus everything the viewport
 * currently shows, so the viewport rectangle never leaves the minimap.
 */
export function minimapWorld(content: Rect | null, viewport: Viewport, size: Size): Rect {
  const view = visibleWorldRect(viewport, size);
  const union = content ? boundsOfRects([content, view]) : view;
  return inflateRect(union ?? view, Math.max(union?.width ?? 0, union?.height ?? 0) * 0.04 + 8);
}

/** Fit `world` into a minimap of `size` pixels, centred, preserving aspect ratio. */
export function minimapTransform(world: Rect, size: Size): MinimapTransform {
  const sx = world.width > 0 ? size.width / world.width : 1;
  const sy = world.height > 0 ? size.height / world.height : 1;
  const scale = Math.min(sx, sy);
  const ox = (size.width - world.width * scale) / 2 - world.x * scale;
  const oy = (size.height - world.height * scale) / 2 - world.y * scale;
  return { scale, ox, oy, world };
}

export function worldToMinimap(t: MinimapTransform, p: Point): Point {
  return { x: p.x * t.scale + t.ox, y: p.y * t.scale + t.oy };
}

export function minimapToWorld(t: MinimapTransform, p: Point): Point {
  return { x: (p.x - t.ox) / t.scale, y: (p.y - t.oy) / t.scale };
}

/** The viewport rectangle in minimap pixels. */
export function viewportRectInMinimap(t: MinimapTransform, viewport: Viewport, size: Size): Rect {
  const v = visibleWorldRect(viewport, size);
  return { x: v.x * t.scale + t.ox, y: v.y * t.scale + t.oy, width: v.width * t.scale, height: v.height * t.scale };
}

/** One thing drawn on the minimap, in world coordinates. Points have no width or height. */
export interface MinimapItem {
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
}

/** Bounds of the items (points count as zero-size rectangles). */
export function minimapContentBounds(items: ReadonlyArray<MinimapItem>): Rect | null {
  if (items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const w = it.width ?? 0;
    const h = it.height ?? 0;
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + w > maxX) maxX = it.x + w;
    if (it.y + h > maxY) maxY = it.y + h;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
