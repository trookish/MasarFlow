"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { resolveCssColor } from "./export";
import { useThemeVersion } from "./use-theme-version";
import type { ViewportController } from "./viewport-controller";
import {
  minimapContentBounds,
  minimapToWorld,
  minimapTransform,
  minimapWorld,
  viewportRectInMinimap,
  type MinimapItem,
} from "./minimap-math";

export type { MinimapItem };

export interface MinimapProps {
  controller: ViewportController;
  /**
   * What to draw, in world coordinates. Read by reference: change `revision` to make the
   * minimap repaint after mutating the array in place (a layout moving 2 000 nodes).
   */
  items: ReadonlyArray<MinimapItem>;
  revision?: number;
  width?: number;
  height?: number;
  /** Colour of the viewport rectangle (CSS colour). Default: the page's ring token. */
  viewColor?: string;
  className?: string;
  "aria-label"?: string;
}

const DOT = 2;

/**
 * An overview of the scene with the current viewport on top. Click or drag to move the view.
 * The item layer is one canvas painted only when `items`/`revision` change; the viewport
 * rectangle is a DOM element moved on each controller update, so panning costs no repaint.
 * Cheap for 2 000 nodes: one fillRect per item per revision.
 */
export function Minimap({
  controller,
  items,
  revision = 0,
  width = 176,
  height = 120,
  viewColor,
  className,
  "aria-label": ariaLabel = "Minimap. Click or drag to move the view.",
}: MinimapProps) {
  const themeVersion = useThemeVersion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const content = useMemo(
    () => minimapContentBounds(items),
    // `revision` stands in for in-place mutation of `items`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, revision],
  );
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  });

  // Paint the items, and keep the viewport rectangle in step with the controller.
  useEffect(() => {
    const canvas = canvasRef.current;
    const viewEl = viewRef.current;
    if (!canvas || !viewEl) return;
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    let lastWorldKey = "";

    const paint = () => {
      if (!ctx) return;
      const t = minimapTransform(
        minimapWorld(contentRef.current, controller.get(), controller.getSize()),
        { width, height },
      );
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const resolved = new Map<string, string>();
      for (const it of items) {
        let color = resolved.get(it.color);
        if (color === undefined) {
          color = resolveCssColor(canvas, it.color);
          resolved.set(it.color, color);
        }
        ctx.fillStyle = color;
        const x = it.x * t.scale + t.ox;
        const y = it.y * t.scale + t.oy;
        if (it.width && it.height) {
          ctx.fillRect(x, y, Math.max(1, it.width * t.scale), Math.max(1, it.height * t.scale));
        } else {
          ctx.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT);
        }
      }
    };

    const place = () => {
      const size = controller.getSize();
      const world = minimapWorld(contentRef.current, controller.get(), size);
      const key = `${world.x.toFixed(1)},${world.y.toFixed(1)},${world.width.toFixed(1)},${world.height.toFixed(1)}`;
      // The minimap's own world only changes when content or the view leave it: repaint then.
      if (key !== lastWorldKey) {
        lastWorldKey = key;
        paint();
      }
      const t = minimapTransform(world, { width, height });
      const r = viewportRectInMinimap(t, controller.get(), size);
      viewEl.style.transform = `translate(${r.x}px, ${r.y}px)`;
      viewEl.style.width = `${Math.max(2, r.width)}px`;
      viewEl.style.height = `${Math.max(2, r.height)}px`;
    };

    paint();
    lastWorldKey = "";
    place();
    return controller.subscribe(place);
  }, [controller, items, revision, width, height, content, themeVersion]);

  // Click / drag navigation.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let dragging: number | null = null;
    const go = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      const t = minimapTransform(
        minimapWorld(contentRef.current, controller.get(), controller.getSize()),
        { width, height },
      );
      const world = minimapToWorld(t, { x: e.clientX - r.left, y: e.clientY - r.top });
      controller.centerOn(world);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      dragging = e.pointerId;
      root.setPointerCapture?.(e.pointerId);
      go(e);
    };
    const move = (e: PointerEvent) => {
      if (dragging === e.pointerId) go(e);
    };
    const up = (e: PointerEvent) => {
      if (dragging !== e.pointerId) return;
      dragging = null;
      root.releasePointerCapture?.(e.pointerId);
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", up);
    };
  }, [controller, width, height]);

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label={ariaLabel}
      title="Minimap: click or drag to move the view"
      data-testid="canvas-minimap"
      className={cn(
        "relative cursor-pointer touch-none overflow-hidden rounded-md border border-border bg-card/80 backdrop-blur",
        className,
      )}
      style={{ width, height }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div
        ref={viewRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 rounded-sm border bg-foreground/5"
        style={{ borderColor: viewColor ?? "var(--ring)" }}
      />
    </div>
  );
}
