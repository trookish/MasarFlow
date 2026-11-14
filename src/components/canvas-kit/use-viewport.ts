"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { ViewportController } from "./viewport-controller";
import {
  wheelZoomFactor,
  type Rect,
  type Size,
  type Viewport,
  type ZoomLimits,
} from "./viewport-math";

export interface UseViewportOptions {
  limits?: Partial<ZoomLimits>;
  initial?: Viewport;
  /** Wheel zoom speed multiplier (the canvas page's "zoom speed" setting). Default 1. */
  wheelSensitivity?: number;
  /**
   * Drag-to-pan. `true` pans on any primary-button drag; a function decides per pointer-down
   * (return false to leave the gesture to the page, e.g. when a node is under the pointer).
   * Middle-button drag always pans. Default: false (the page starts pans itself).
   */
  dragPan?: boolean | ((event: PointerEvent) => boolean);
  /** Keyboard zoom/pan while the element has focus (+, -, 0, arrows, 1 = fit). Default true. */
  keyboard?: boolean;
  /** Called by the "1" key. */
  onFit?: () => void;
  /** Called when the user (not code) moved the camera: wheel, drag or keyboard. */
  onUserMove?: () => void;
}

export interface UseViewport {
  controller: ViewportController;
  /** Attach to the element that receives wheel/pointer/keyboard input and defines the view size. */
  bind: (element: HTMLElement | null) => void;
}

/**
 * One pan/zoom hook for every interactive page. The viewport lives in a `ViewportController`
 * (outside React), so a canvas renderer subscribes and redraws per frame; use `useViewportValue`
 * where a component really needs the value as React state.
 */
export function useViewport(options: UseViewportOptions = {}): UseViewport {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });
  const controller = useMemo(
    () => new ViewportController({ limits: options.limits, initial: options.initial }),
    // The controller is created once; limits and the initial viewport are not reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => controller.dispose(), [controller]);

  const cleanupRef = useRef<(() => void) | null>(null);
  const bind = useCallback(
    (element: HTMLElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!element) return;

      const measure = () => {
        const r = element.getBoundingClientRect();
        controller.setSize({ width: r.width, height: r.height });
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(element);

      const localPoint = (e: { clientX: number; clientY: number }) => {
        const r = element.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      // React's root wheel listener is passive, so preventDefault() there cannot stop the page
      // from scrolling: attach a native non-passive listener.
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = wheelZoomFactor(e.deltaY, e.deltaMode, {
          sensitivity: optsRef.current.wheelSensitivity,
          ctrlKey: e.ctrlKey,
        });
        controller.zoomAt(factor, localPoint(e));
        optsRef.current.onUserMove?.();
      };
      element.addEventListener("wheel", onWheel, { passive: false });

      let pan: { id: number; lastX: number; lastY: number } | null = null;
      const onPointerDown = (e: PointerEvent) => {
        const dragPan = optsRef.current.dragPan;
        const middle = e.button === 1;
        if (!middle) {
          if (e.button !== 0 || !dragPan) return;
          if (typeof dragPan === "function" && !dragPan(e)) return;
        }
        pan = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
        element.setPointerCapture?.(e.pointerId);
        if (middle) e.preventDefault();
      };
      const onPointerMove = (e: PointerEvent) => {
        if (!pan || pan.id !== e.pointerId) return;
        controller.panBy(e.clientX - pan.lastX, e.clientY - pan.lastY);
        pan.lastX = e.clientX;
        pan.lastY = e.clientY;
        optsRef.current.onUserMove?.();
      };
      const onPointerEnd = (e: PointerEvent) => {
        if (!pan || pan.id !== e.pointerId) return;
        pan = null;
        element.releasePointerCapture?.(e.pointerId);
      };
      element.addEventListener("pointerdown", onPointerDown);
      element.addEventListener("pointermove", onPointerMove);
      element.addEventListener("pointerup", onPointerEnd);
      element.addEventListener("pointercancel", onPointerEnd);

      const onKeyDown = (e: KeyboardEvent) => {
        if (optsRef.current.keyboard === false) return;
        // Typing in a field inside the element must not zoom the view.
        const t = e.target as HTMLElement | null;
        if (t && t !== element && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
          return;
        }
        const handled = controller.handleKey(e.key, e, optsRef.current.onFit);
        if (handled) {
          e.preventDefault();
          optsRef.current.onUserMove?.();
        }
      };
      element.addEventListener("keydown", onKeyDown);

      cleanupRef.current = () => {
        ro.disconnect();
        element.removeEventListener("wheel", onWheel);
        element.removeEventListener("pointerdown", onPointerDown);
        element.removeEventListener("pointermove", onPointerMove);
        element.removeEventListener("pointerup", onPointerEnd);
        element.removeEventListener("pointercancel", onPointerEnd);
        element.removeEventListener("keydown", onKeyDown);
      };
    },
    [controller],
  );
  useEffect(() => () => cleanupRef.current?.(), []);

  return { controller, bind };
}

/** The viewport as React state, for the few consumers that render from it (a zoom readout). */
export function useViewportValue(controller: ViewportController): Viewport {
  return useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.get(),
    () => controller.get(),
  );
}

export type { Rect, Size };
