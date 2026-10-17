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
import type { DockNode, DockZone } from "@/lib/dock/types";
import { pageIdOf } from "@/lib/dock/types";
import { zoneForPoint, type Rect } from "@/lib/dock/geometry";
import { dropVerdict } from "@/lib/dock/dropguard";
import { collectPages } from "@/lib/dock/tree";
import { getPageDef } from "@/lib/dock/registry";
import { useProjectStore } from "@/lib/stores/project";
import { useDockStore } from "@/lib/stores/dock";
import { useViewportMode } from "@/lib/hooks/use-narrow-viewport";
import { PAGE_COMPONENTS } from "./panel-loader";
import { PanelErrorBoundary, PanelMissing } from "./panel-error";
import { DockTreeView } from "./dock-tree-view";
import { PanelContent } from "./panel-content";
import { DockFloatingWindow } from "./dock-floating-window";
import { DockTray } from "./dock-tray";
import { DockOverlay } from "./dock-overlay";
import { useDockDnd } from "./use-dock-dnd";
import { useTerminalSync } from "@/lib/hooks/use-terminal-sync";

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
  const mode = useViewportMode();
  const [compactPanel, setCompactPanel] = useState<string | null>(null);

  useDockDnd();
  useTerminalSync();

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

      const tree = projectState?.workspaces[projectState.activeWorkspace]?.tree;
      if (!tree) return;

      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-dock-node]"),
      );
      let hit: { id: string; zone: DockZone | null; refused: string | null } | null = null;
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
          const id = node.dataset.dockNode as string;
          const verdict = dropVerdict(tree, drag.source, id, z);
          hit = { id, zone: verdict.ok ? z : null, refused: verdict.ok ? null : verdict.reason };
          if (verdict.ok && z === "tab") break; // most specific valid target wins
        }
      }

      const nextZone = hit?.zone ?? null;
      const nextTarget = hit ? hit.id : null;
      const nextRefused = hit?.refused ?? null;
      if (
        drag.zone !== nextZone ||
        drag.targetId !== nextTarget ||
        drag.refused !== nextRefused
      ) {
        setDrag({ ...drag, zone: nextZone, targetId: nextTarget, refused: nextRefused });
      }
    },
    [drag, setDrag, projectState],
  );

  if (!activeProjectId || !projectState) {
    return <div className="h-full w-full bg-background" />;
  }

  const wsEntry = projectState.workspaces[projectState.activeWorkspace];
  const tree: DockNode = wsEntry.tree;
  const maximized = projectState.maximizedPanelId;

  // Compact mode (viewport < 1024px): the split layout is PRESERVED IN STATE
  // but not rendered, so widening the window restores it exactly — same
  // ratios, same tabs. Floating windows are hidden in compact mode too (they
  // would overlap the single column) and reappear on widening; nothing about
  // them is destroyed. The switcher lists the tree's panels (floaters keep
  // their own state and are intentionally not offered here).
  const pages = collectPages(tree);
  const firstPanel = pages[0] ?? null;
  // A panel closed (or floated away) while the switcher pointed at it must not
  // keep rendering: adjust the state during render, never in an effect.
  if (compactPanel !== null && !pages.includes(compactPanel)) setCompactPanel(null);

  // e2e anchor (P9.T6): `data-testid="shell-ready"` is on this root because it
  // is rendered only while a project is active — specs wait for "the workspace
  // is interactive" instead of a timeout.
  return (
    <div
      ref={containerRef}
      data-dock-workspace=""
      data-testid="shell-ready"
      onPointerMove={onPointerMove}
      className="relative h-full w-full overflow-hidden"
    >
      {mode === "compact" ? (
        <div className="flex h-full min-h-0 flex-col">
          <div
            role="tablist"
            aria-label="Open panels"
            className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-1.5"
          >
            {pages.map((panelId) => (
              <button
                key={panelId}
                type="button"
                role="tab"
                aria-selected={(compactPanel ?? firstPanel) === panelId}
                onClick={() => setCompactPanel(panelId)}
                className={
                  (compactPanel ?? firstPanel) === panelId
                    ? "h-7 shrink-0 rounded-md bg-accent px-2 text-xs font-medium"
                    : "h-7 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent/50"
                }
              >
                {getPageDef(panelId)?.label ?? pageIdOf(panelId)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <PanelContent active>
              {(() => {
                const Active = PAGE_COMPONENTS[pageIdOf(compactPanel ?? firstPanel ?? "")] ?? null;
                return Active ? (
                  <PanelErrorBoundary panelId={compactPanel ?? firstPanel ?? ""}>
                    <Active />
                  </PanelErrorBoundary>
                ) : (
                  <PanelMissing panelId={compactPanel ?? firstPanel ?? ""} />
                );
              })()}
            </PanelContent>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function MaximizedPanel({ panelId }: { panelId: string }) {
  const Component = PAGE_COMPONENTS[pageIdOf(panelId)] ?? null;
  return Component ? (
    <PanelErrorBoundary panelId={panelId}>
      <Component />
    </PanelErrorBoundary>
  ) : (
    <PanelMissing panelId={panelId} />
  );
}
