import {
  DEFAULT_ZOOM_LIMITS,
  IDENTITY_VIEWPORT,
  centerViewport,
  easeOutCubic,
  fitViewport,
  interpolateViewport,
  panBy,
  screenToWorld,
  viewportKeyAction,
  viewportsEqual,
  worldToScreen,
  zoomAt,
  type FitOptions,
  type Point,
  type Rect,
  type Size,
  type Viewport,
  type ZoomLimits,
} from "./viewport-math";

export interface ViewportControllerOptions {
  limits?: Partial<ZoomLimits>;
  initial?: Viewport;
  size?: Size;
  /** Frame scheduler for animations; defaults to requestAnimationFrame. Injected in tests. */
  raf?: (cb: (time: number) => void) => number;
  cancelRaf?: (id: number) => void;
  now?: () => number;
}

type Listener = (vp: Viewport) => void;

/**
 * The imperative core of `useViewport`. It owns the viewport value outside React so a canvas
 * renderer can redraw on every pan/zoom frame without re-rendering a component tree. Subscribers
 * (the renderer, the minimap) are notified synchronously on every change.
 */
export class ViewportController {
  readonly limits: ZoomLimits;
  private vp: Viewport;
  private size: Size;
  private listeners = new Set<Listener>();
  private animationId: number | null = null;
  private animating = false;
  private readonly raf: (cb: (time: number) => void) => number;
  private readonly cancelRaf: (id: number) => void;
  private readonly now: () => number;

  constructor(opts: ViewportControllerOptions = {}) {
    this.limits = { ...DEFAULT_ZOOM_LIMITS, ...opts.limits };
    this.vp = opts.initial ?? IDENTITY_VIEWPORT;
    this.size = opts.size ?? { width: 0, height: 0 };
    this.raf =
      opts.raf ??
      ((cb) =>
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame(cb)
          : (setTimeout(() => cb(Date.now()), 16) as unknown as number));
    this.cancelRaf =
      opts.cancelRaf ??
      ((id) =>
        typeof cancelAnimationFrame === "function"
          ? cancelAnimationFrame(id)
          : clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  }

  get(): Viewport {
    return this.vp;
  }

  getSize(): Size {
    return this.size;
  }

  /** True while an animated move (fitTo, centerOn with animate) is in flight. */
  isAnimating(): boolean {
    return this.animating;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSize(size: Size): void {
    if (size.width === this.size.width && size.height === this.size.height) return;
    this.size = size;
    this.emit();
  }

  /** Replace the viewport. Cancels any running animation. */
  set(next: Viewport): void {
    this.cancelAnimation();
    this.apply(next);
  }

  panBy(dx: number, dy: number): void {
    this.cancelAnimation();
    this.apply(panBy(this.vp, dx, dy));
  }

  /** Zoom by `factor` around a screen-space anchor (default: the centre of the view). */
  zoomAt(factor: number, anchor?: Point): void {
    this.cancelAnimation();
    this.apply(zoomAt(this.vp, anchor ?? this.centre(), factor, this.limits));
  }

  zoomIn(): void {
    this.zoomAt(1.25);
  }

  zoomOut(): void {
    this.zoomAt(1 / 1.25);
  }

  /** Back to 100% zoom, keeping the world point at the centre where it is. */
  reset(): void {
    const c = this.centre();
    const w = screenToWorld(this.vp, c);
    this.moveTo(centerViewport(w, this.size, 1, this.limits), false);
  }

  /** Show `bounds` entirely, with `padding` pixels of margin. */
  fitTo(bounds: Rect | null, opts: FitOptions & { animate?: boolean } = {}): void {
    if (!bounds || this.size.width <= 0 || this.size.height <= 0) return;
    const target = fitViewport(bounds, this.size, { limits: this.limits, ...opts });
    this.moveTo(target, opts.animate ?? false);
  }

  /** Put a world point at the centre of the view, optionally at a given zoom. */
  centerOn(world: Point, opts: { k?: number; animate?: boolean } = {}): void {
    const target = centerViewport(world, this.size, opts.k ?? this.vp.k, this.limits);
    this.moveTo(target, opts.animate ?? false);
  }

  screenToWorld(p: Point): Point {
    return screenToWorld(this.vp, p);
  }

  worldToScreen(p: Point): Point {
    return worldToScreen(this.vp, p);
  }

  /** Apply a keyboard action. Returns true when the key was a viewport key. */
  handleKey(
    key: string,
    mods: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
    onFit?: () => void,
  ): boolean {
    const action = viewportKeyAction(key, mods);
    if (!action) return false;
    if (action.type === "zoom") this.zoomAt(action.factor);
    else if (action.type === "pan") this.panBy(action.dx, action.dy);
    else if (action.type === "reset") this.reset();
    else if (action.type === "fit") {
      if (!onFit) return false;
      onFit();
    }
    return true;
  }

  dispose(): void {
    this.cancelAnimation();
    this.listeners.clear();
  }

  private centre(): Point {
    return { x: this.size.width / 2, y: this.size.height / 2 };
  }

  private moveTo(target: Viewport, animate: boolean): void {
    this.cancelAnimation();
    if (!animate || this.size.width <= 0) {
      this.apply(target);
      return;
    }
    if (viewportsEqual(target, this.vp, 1e-6)) return;
    const from = this.vp;
    const started = this.now();
    const duration = 280;
    this.animating = true;
    const step = () => {
      const t = Math.min(1, (this.now() - started) / duration);
      if (t >= 1) {
        // Land exactly on the target and tell listeners the camera is idle again.
        this.vp = target;
        this.animating = false;
        this.animationId = null;
        this.emit();
        return;
      }
      this.apply(interpolateViewport(from, target, this.size, easeOutCubic(t)));
      this.animationId = this.raf(step);
    };
    this.animationId = this.raf(step);
  }

  private cancelAnimation(): void {
    if (this.animationId !== null) this.cancelRaf(this.animationId);
    this.animationId = null;
    if (this.animating) {
      this.animating = false;
      // Listeners learn that the camera went idle.
      this.emit();
    }
  }

  private apply(next: Viewport): void {
    if (viewportsEqual(next, this.vp, 1e-12) && !this.animating) return;
    this.vp = next;
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l(this.vp);
  }
}
