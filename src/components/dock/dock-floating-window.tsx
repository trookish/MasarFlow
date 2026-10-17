"use client";

/**
 * Floating (undocked) window: drag via title bar, resize from edges/corners,
 * minimize / maximize / close controls, z-ordered focus. Geometry lives in
 * the dock state (FloatWindow), so positions persist across reloads.
 */

import { useCallback } from "react";
import { X, Minus, Square, GripVertical } from "lucide-react";
import type { FloatWindow } from "@/lib/dock/types";
import { pageIdOf } from "@/lib/dock/types";
import { getPageDef } from "@/lib/dock/registry";
import { useDockStore } from "@/lib/stores/dock";
import { PAGE_COMPONENTS } from "./panel-loader";
import { PanelContent } from "./panel-content";
import { PanelErrorBoundary, PanelMissing } from "./panel-error";
import { startFloaterDrag } from "./use-dock-dnd";
import { cn } from "@/lib/utils/cn";

/** Edge/corner resize handles: [css class, resize flags]. */
const HANDLES: Array<{
  id: string;
  className: string;
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}> = [
  { id: "n", className: "top-0 left-0 right-0 h-1 cursor-n-resize", dx: 0, dy: -1 },
  { id: "s", className: "bottom-0 left-0 right-0 h-1 cursor-s-resize", dx: 0, dy: 1 },
  { id: "e", className: "right-0 top-0 bottom-0 w-1 cursor-e-resize", dx: 1, dy: 0 },
  { id: "w", className: "left-0 top-0 bottom-0 w-1 cursor-w-resize", dx: -1, dy: 0 },
  { id: "ne", className: "top-0 right-0 h-2 w-2 cursor-ne-resize", dx: 1, dy: -1 },
  { id: "nw", className: "top-0 left-0 h-2 w-2 cursor-nw-resize", dx: -1, dy: -1 },
  { id: "se", className: "bottom-0 right-0 h-2 w-2 cursor-se-resize", dx: 1, dy: 1 },
  { id: "sw", className: "bottom-0 left-0 h-2 w-2 cursor-sw-resize", dx: -1, dy: 1 },
];

const MIN_W = 280;
const MIN_H = 160;

export function DockFloatingWindow({ floater }: { floater: FloatWindow }) {
  const moveFloater = useDockStore((s) => s.moveFloater);
  const resizeFloater = useDockStore((s) => s.resizeFloater);
  const focusFloater = useDockStore((s) => s.focusFloater);
  const toggleFloaterMinimized = useDockStore((s) => s.toggleFloaterMinimized);
  const toggleFloaterMaximized = useDockStore((s) => s.toggleFloaterMaximized);
  const close = useDockStore((s) => s.close);

  const def = getPageDef(floater.activePanel);
  const Icon = def?.icon;

  /** Shared gesture helper: pointer-capture drag for move/resize. */
  const gesture = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      onMove: (dx: number, dy: number) => void,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      const startX = e.clientX;
      const startY = e.clientY;
      el.setPointerCapture(e.pointerId);
      const handle = (ev: PointerEvent) =>
        onMove(ev.clientX - startX, ev.clientY - startY);
      const up = () => {
        el.removeEventListener("pointermove", handle);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointermove", handle);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    },
    [],
  );

  const startWindowDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // Begin a dock drag (enables docking to tree targets on release) and
      // move the window live via the same gesture.
      startFloaterDrag(floater.id, floater.panelIds, e);
      const { x, y } = floater;
      gesture(e, (dx, dy) => {
        moveFloater(floater.id, {
          x: Math.max(0, x + dx),
          y: Math.max(0, y + dy),
        });
      });
    },
    [floater, gesture, moveFloater],
  );

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLElement>, h: (typeof HANDLES)[number]) => {
      const { x, y, width, height } = floater;
      gesture(e, (dx, dy) => {
        const next = { x, y, w: width, h: height };
        if (h.dx === 1) next.w = Math.max(MIN_W, width + dx);
        if (h.dx === -1) {
          next.w = Math.max(MIN_W, width - dx);
          next.x = x + (width - next.w);
        }
        if (h.dy === 1) next.h = Math.max(MIN_H, height + dy);
        if (h.dy === -1) {
          next.h = Math.max(MIN_H, height - dy);
          next.y = y + (height - next.h);
        }
        resizeFloater(floater.id, { w: next.w, h: next.h });
        if (next.x !== x || next.y !== y) {
          moveFloater(floater.id, { x: next.x, y: next.y });
        }
      });
    },
    [floater, gesture, moveFloater, resizeFloater],
  );

  const ActiveComponent = PAGE_COMPONENTS[pageIdOf(floater.activePanel)] ?? null;

  return (
    <section
      role="dialog"
      aria-label={def?.label ?? floater.activePanel}
      onPointerDown={() => focusFloater(floater.id)}
      style={
        floater.maximized
          ? undefined
          : { left: floater.x, top: floater.y, width: floater.width, height: floater.height }
      }
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/30",
        floater.maximized
          ? "inset-0 z-30 rounded-none"
          : "z-40",
      )}
    >
      {/* Title bar */}
      <header
        onPointerDown={startWindowDrag}
        className="flex h-8 shrink-0 cursor-grab items-center gap-1.5 border-b border-border bg-sidebar/80 px-2 select-none"
      >
        {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="truncate text-xs font-medium">
          {def?.label ?? pageIdOf(floater.activePanel)}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Minimize window"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleFloaterMinimized(floater.id)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Maximize window"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleFloaterMaximized(floater.id)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Close window"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => close(pageIdOf(floater.activePanel))}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </header>

      {/* Content: multi-panel floaters get a mini tab strip. */}
      {floater.panelIds.length > 1 ? (
        <div className="flex h-7 shrink-0 items-center gap-0.5 border-b border-border bg-background/60 px-1">
          {floater.panelIds.map((p) => {
            const d = getPageDef(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() =>
                  useDockStore.setState((s) => ({
                    projects: {
                      ...s.projects,
                      [s.activeProjectId!]: {
                        ...s.projects[s.activeProjectId!],
                        floaters: s.projects[s.activeProjectId!].floaters.map((f) =>
                          f.id === floater.id ? { ...f, activePanel: p } : f,
                        ),
                      },
                    },
                  }))
                }
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  p === floater.activePanel
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                {d?.label ?? pageIdOf(p)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <PanelContent active>
          {ActiveComponent ? (
            <PanelErrorBoundary panelId={floater.activePanel}>
              <ActiveComponent />
            </PanelErrorBoundary>
          ) : (
            <PanelMissing panelId={floater.activePanel} />
          )}
        </PanelContent>
      </div>

      {/* Resize handles (skip while maximized). */}
      {!floater.maximized &&
        HANDLES.map((h) => (
          <div
            key={h.id}
            onPointerDown={(e) => startResize(e, h)}
            className={cn("absolute z-10", h.className)}
          />
        ))}
    </section>
  );
}
