"use client";

/**
 * Dock workspace: renders the active workspace's layout tree, floating
 * windows, the tray, maximize handling, and — while a drag is active —
 * measures drop targets and drives the docking overlay.
 *
 * Drop targeting: elements with [data-dock-node] are candidate targets.
 * On pointermove the workspace hit-tests the pointer against their rects
 * (zoneForPoint) and writes zone/targetId into the drag state; the commit
 * happens in use-dock-dnd on pointerup. The nav dock area at the bottom of
 * the screen is excluded (targetId "outside" cancels the drag).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DockNode } from "@/lib/dock/types";
import { pageIdOf } from "@/lib/dock/types";
import { zoneForPoint, type Rect } from "@/lib/dock/geometry";
import { useProjectStore } from "@/lib/stores/project";
import { useDockStore } from "@/lib/stores/dock";
import { PAGE_COMPONENTS } from "./panel-loader";
import { DockTreeView } from "./dock-tree-view";
import { PanelContent } from "./panel-content";
import { DockFloatingWindow } from "./dock-floating-window";
import { DockTray } from "./dock-tray";
import { DockOverlay } from "./dock-overlay";
import { useDockDnd } from "./use-dock-dnd";

/** Height of the floating nav dock zone at the bottom of the viewport. */
const NAV_DOCK_EXCLUSION_PX = 90;

export function DockWorkspace() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projectState = useDockStore((s) =>
    s.activeProjectId ? (s.projects[s.activeProjectId] ?? null) : null,
  );
  const drag = useDockStore((s) => s.drag);
  const setDrag = useDockStore((s) => s.setDrag);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  useDockDnd();

  // Track the workspace rect for overlay coordinate conversion.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const box = el.getBoundingClientRect();
      setRect({ x: box.left, y: box.top, width: box.width, height: box.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Hit-test: while dragging, classify the pointer against candidate targets.
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return;
      const container = containerRef.current;
      if (!container) return;

      // Cancel when the pointer hovers the bottom nav-dock strip.
      if (e.clientY > window.innerHeight - NAV_DOCK_EXCLUSION_PX) {
        if (drag.targetId !== "outside") setDrag({ ...drag, zone: null, targetId: "outside" });
        return;
      }

      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-dock-node]"),
      );
      let hit: { id: string; zone: ReturnType<typeof zoneForPoint> } | null = null;
      for (const node of nodes) {
        const box = node.getBoundingClientRect();
        const r: Rect = { x: box.left, y: box.top, width: box.width, height: box.height };
        if (
          e.clientX >= r.x &&
          e.clientX <= r.x + r.width &&
          e.clientY >= r.y &&
          e.clientY <= r.y + r.height
        ) {
          const z = zoneForPoint(r, e.clientX, e.clientY);
          hit = { id: node.dataset.dockNode as string, zone: z };
          if (z === "tab") break; // most specific target wins
        }
      }

      const nextZone = hit?.zone ?? null;
      const nextTarget = hit?.id ?? null;
      if (drag.zone !== nextZone || drag.targetId !== nextTarget) {
        setDrag({ ...drag, zone: nextZone, targetId: nextTarget });
      }
    },
    [drag, setDrag],
  );

  if (!activeProjectId || !projectState) {
    return <div className="h-full w-full bg-background" />;
  }

  const wsEntry = projectState.workspaces[projectState.activeWorkspace];
  const tree: DockNode = wsEntry.tree;
  const maximized = projectState.maximizedPanelId;

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      className="relative h-full w-full overflow-hidden"
    >
      {/* Layout tree, hidden while a panel is maximized (stays mounted). */}
      <PanelContent active={!maximized}>
        <DockTreeView node={tree} />
      </PanelContent>

      {/* Maximized tiled panel fills the workspace above the tree. */}
      {maximized ? (
        <div className="absolute inset-0 z-20">
          <MaximizedPanel panelId={maximized} />
        </div>
      ) : null}

      {/* Floating windows. */}
      {projectState.floaters.map((f) =>
        f.minimized ? null : <DockFloatingWindow key={f.id} floater={f} />,
      )}

      {/* Minimized windows + collapsed panels. */}
      <DockTray />

      {/* Docking guides during a drag. */}
      {drag && rect ? <DockOverlay workspaceRect={rect} /> : null}
    </div>
  );
}

function MaximizedPanel({ panelId }: { panelId: string }) {
  const Component = PAGE_COMPONENTS[pageIdOf(panelId)] ?? null;
  return Component ? (
    <Component />
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Page not found: {pageIdOf(panelId)}
    </div>
  );
}
