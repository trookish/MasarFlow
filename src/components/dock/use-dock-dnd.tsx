"use client";

/**
 * Dock drag & drop controller — pointer-events based, no libraries.
 *
 * A drag starts from a tab / group header (startPanelDrag) or a floater
 * title bar (startFloaterDrag). While active, the workspace measures drop
 * targets and writes zone/targetId into the drag state; the overlay shows
 * the preview. On pointerup the controller commits via the store (move /
 * dockFloater / float). Escape cancels; releasing outside the workspace
 * (targetId "outside", e.g. over the nav dock) cancels too.
 *
 * The tree is never mutated during the drag — only on commit. Floater
 * windows move live via their own gesture; the controller only handles
 * their docking commit.
 */

import { useEffect, useRef } from "react";
import { useDockStore } from "@/lib/stores/dock";

/**
 * Global pointer listener while a drag is active. The workspace component
 * sets zone/targetId on the drag state from its measured rects; this hook
 * tracks the raw pointer and performs the commit/cancel.
 */
export function useDockDnd(): void {
  const drag = useDockStore((s) => s.drag);
  // Pointer position where the active drag started (drag.pointer is updated
  // during the move, so the origin must be captured separately).
  const originRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!drag) {
      originRef.current = null;
      return;
    }
    if (!originRef.current) originRef.current = { ...drag.pointer };

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") useDockStore.getState().setDrag(null);
    }
    window.addEventListener("keydown", onKey);

    function onMove(e: PointerEvent) {
      const s = useDockStore.getState();
      if (!s.drag) return;
      if (s.drag.pointer.x === e.clientX && s.drag.pointer.y === e.clientY) return;
      s.setDrag({ ...s.drag, pointer: { x: e.clientX, y: e.clientY } });
    }

    function onUp(e: PointerEvent) {
      const s = useDockStore.getState();
      const d = s.drag;
      const origin = originRef.current;
      s.setDrag(null);
      originRef.current = null;
      if (!d || !origin) return;

      const { source, zone, targetId } = d;
      const overWorkspace = targetId !== "outside";

      // A click (no meaningful movement) never commits — it must not float,
      // move, or dock anything. Tab focus already happened on pointerdown.
      const dist = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);
      if (source.kind !== "floater" && dist < 4) return;

      if (source.kind === "floater") {
        // The window moved live via its own gesture; if the release happened
        // over a highlighted drop zone, dock it there.
        if (overWorkspace && zone && targetId) {
          s.dockFloater(source.floaterId, targetId, zone);
        }
        return;
      }

      if (source.kind === "group") {
        // Group drags move their primary (active) panel with the whole group
        // carried by movePanel's group semantics.
        if (!overWorkspace) return;
        if (zone && targetId) {
          const holder = useDockStore.getState();
          const state = holder.activeProjectId
            ? holder.projects[holder.activeProjectId]
            : null;
          const group = state
            ? findGroupId(state.workspaces[state.activeWorkspace].tree, source.nodeId)
            : null;
          const primary =
            group && group.type === "tabs"
              ? group.activePage
              : group && group.type === "page"
                ? group.pageId
                : null;
          if (primary) s.move(primary, targetId, zone);
        }
        return;
      }

      // Panel drag.
      const panelId = source.panelId;
      if (!overWorkspace) return; // released outside -> cancel

      if (zone && targetId) {
        s.move(panelId, targetId, zone);
        return;
      }

      // No highlighted zone: release over free space floats the panel.
      s.float(panelId, {
        x: Math.max(0, e.clientX - 280),
        y: Math.max(0, e.clientY - 20),
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag]);
}

function findGroupId(
  tree: import("@/lib/dock/types").DockNode,
  id: string,
): import("@/lib/dock/types").DockNode | null {
  if (tree.id === id) return tree;
  if (tree.type === "split") {
    for (const child of tree.children) {
      const hit = findGroupId(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Start a drag from a dock tab or group header. */
export function startPanelDrag(
  panelId: string,
  nodeId: string,
  e: React.PointerEvent,
): void {
  if (e.button !== 0) return;
  useDockStore.getState().setDrag({
    source: { kind: "panel", panelId, nodeId },
    pointer: { x: e.clientX, y: e.clientY },
    zone: null,
    targetId: null,
  });
}

/** Start a drag from a floater title bar (the window itself is the source). */
export function startFloaterDrag(
  floaterId: string,
  panelIds: string[],
  e: React.PointerEvent,
): void {
  if (e.button !== 0) return;
  useDockStore.getState().setDrag({
    source: { kind: "floater", floaterId, panelIds },
    pointer: { x: e.clientX, y: e.clientY },
    zone: null,
    targetId: null,
  });
}
