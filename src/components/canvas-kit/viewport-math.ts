/**
 * Pure viewport maths shared by every interactive page (graph, canvas, architecture).
 *
 * A viewport maps world space to screen space: `screen = world * k + (x, y)`. Nothing here knows
 * about notes, tasks or systems, and nothing touches the DOM, so it is unit-testable in node.
 */

export interface Viewport {
  /** Screen-space offset of the world origin, in CSS pixels. */
  x: number;
  y: number;
  /** Zoom factor: screen pixels per world unit. */
  k: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** An axis-aligned rectangle in world or screen space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

export const DEFAULT_ZOOM_LIMITS: ZoomLimits = { min: 0.05, max: 4 };
export const IDENTITY_VIEWPORT: Viewport = { x: 0, y: 0, k: 1 };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampZoom(k: number, limits: ZoomLimits = DEFAULT_ZOOM_LIMITS): number {
  return clamp(k, limits.min, limits.max);
}

export function screenToWorld(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.x) / vp.k, y: (p.y - vp.y) / vp.k };
}

export function worldToScreen(vp: Viewport, p: Point): Point {
  return { x: p.x * vp.k + vp.x, y: p.y * vp.k + vp.y };
}

/** Pan by a screen-space delta. */
export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { x: vp.x + dx, y: vp.y + dy, k: vp.k };
}

/**
 * Zoom by `factor` around a screen-space anchor: the world point under the anchor stays under it.
 * The resulting zoom is clamped to `limits`; the anchor invariant holds for the clamped value.
 */
export function zoomAt(
  vp: Viewport,
  anchor: Point,
  factor: number,
  limits: ZoomLimits = DEFAULT_ZOOM_LIMITS,
): Viewport {
  return zoomTo(vp, anchor, vp.k * factor, limits);
}

/** Like `zoomAt` but with an absolute target zoom. */
export function zoomTo(
  vp: Viewport,
  anchor: Point,
  targetK: number,
  limits: ZoomLimits = DEFAULT_ZOOM_LIMITS,
): Viewport {
  const k = clampZoom(targetK, limits);
  if (k === vp.k) return vp;
  const world = screenToWorld(vp, anchor);
  return { k, x: anchor.x - world.x * k, y: anchor.y - world.y * k };
}

/**
 * Wheel delta to a zoom factor. Exponential, so zooming in then out by the same delta is a no-op.
 * `deltaMode` follows the DOM (0 pixels, 1 lines, 2 pages). `ctrlKey` wheel events are trackpad
 * pinch gestures, which report small deltas, so they zoom faster.
 */
export function wheelZoomFactor(
  deltaY: number,
  deltaMode = 0,
  opts: { sensitivity?: number; ctrlKey?: boolean } = {},
): number {
  const unit = deltaMode === 1 ? 33 : deltaMode === 2 ? 400 : 1;
  const base = opts.ctrlKey ? 0.01 : 0.0016;
  return Math.exp(-deltaY * unit * base * (opts.sensitivity ?? 1));
}

/** The world-space rectangle currently visible in a viewport of the given screen size. */
export function visibleWorldRect(vp: Viewport, size: Size): Rect {
  return {
    x: -vp.x / vp.k,
    y: -vp.y / vp.k,
    width: size.width / vp.k,
    height: size.height / vp.k,
  };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Smallest rectangle containing all points, or null for none. */
export function boundsOfPoints(points: Iterable<Point>): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Smallest rectangle containing all rectangles, or null for none. */
export function boundsOfRects(rects: Iterable<Rect>): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function inflateRect(r: Rect, amount: number): Rect {
  return {
    x: r.x - amount,
    y: r.y - amount,
    width: r.width + amount * 2,
    height: r.height + amount * 2,
  };
}

export interface FitOptions {
  /** Screen-space padding on every side, in pixels. */
  padding?: number;
  limits?: ZoomLimits;
  /** Never zoom in past this when fitting (a single node should not fill the screen). */
  maxFitZoom?: number;
}

/**
 * The viewport that shows `bounds` entirely, centred, with `padding` pixels of margin.
 * A degenerate rectangle (one point, or a line) is centred at the largest allowed zoom.
 */
export function fitViewport(bounds: Rect, size: Size, opts: FitOptions = {}): Viewport {
  const padding = opts.padding ?? 48;
  const limits = opts.limits ?? DEFAULT_ZOOM_LIMITS;
  const maxK = Math.min(limits.max, opts.maxFitZoom ?? limits.max);
  const availW = Math.max(1, size.width - padding * 2);
  const availH = Math.max(1, size.height - padding * 2);
  const kx = bounds.width > 0 ? availW / bounds.width : Infinity;
  const ky = bounds.height > 0 ? availH / bounds.height : Infinity;
  const k = clamp(Math.min(kx, ky, maxK), limits.min, maxK);
  const c = rectCenter(bounds);
  return { k, x: size.width / 2 - c.x * k, y: size.height / 2 - c.y * k };
}

/** The viewport that puts a world point at the centre of the screen, optionally at a new zoom. */
export function centerViewport(
  world: Point,
  size: Size,
  k: number,
  limits: ZoomLimits = DEFAULT_ZOOM_LIMITS,
): Viewport {
  const kk = clampZoom(k, limits);
  return { k: kk, x: size.width / 2 - world.x * kk, y: size.height / 2 - world.y * kk };
}

/**
 * Interpolate between two viewports. The world point at the screen centre moves linearly and the
 * zoom moves exponentially, which reads as a smooth camera move for both pans and zooms.
 */
export function interpolateViewport(a: Viewport, b: Viewport, size: Size, t: number): Viewport {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const centre = { x: size.width / 2, y: size.height / 2 };
  const ca = screenToWorld(a, centre);
  const cb = screenToWorld(b, centre);
  const k = a.k * Math.pow(b.k / a.k, t);
  const wx = ca.x + (cb.x - ca.x) * t;
  const wy = ca.y + (cb.y - ca.y) * t;
  return { k, x: centre.x - wx * k, y: centre.y - wy * k };
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

export function viewportsEqual(a: Viewport, b: Viewport, eps = 1e-9): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.k - b.k) < eps;
}

/** Keyboard zoom/pan actions, resolved from a key press so the mapping is testable. */
export type ViewportKeyAction =
  | { type: "zoom"; factor: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "reset" }
  | { type: "fit" };

export function viewportKeyAction(
  key: string,
  mods: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
): ViewportKeyAction | null {
  if (mods.ctrlKey || mods.metaKey || mods.altKey) return null;
  const step = mods.shiftKey ? 160 : 48;
  switch (key) {
    case "+":
    case "=":
      return { type: "zoom", factor: 1.25 };
    case "-":
    case "_":
      return { type: "zoom", factor: 1 / 1.25 };
    case "0":
      return { type: "reset" };
    case "1":
      return { type: "fit" };
    // Panning moves the content in the direction of the arrow, like dragging with the mouse.
    case "ArrowLeft":
      return { type: "pan", dx: step, dy: 0 };
    case "ArrowRight":
      return { type: "pan", dx: -step, dy: 0 };
    case "ArrowUp":
      return { type: "pan", dx: 0, dy: step };
    case "ArrowDown":
      return { type: "pan", dx: 0, dy: -step };
    default:
      return null;
  }
}
