"use client";

import { useEffect } from "react";
import { useUIStore } from "@/lib/stores/ui";
import { useDockStore } from "@/lib/stores/dock";
import { focusedPanelId } from "@/lib/dock/dock-core";
import { findHolder } from "@/lib/dock/tree";
import { pageIdOf } from "@/lib/dock/types";
import { dockActionFor, type DockKeyAction } from "@/lib/dock/keymap";
import {
  layoutRects,
  neighborInDirection,
  focusTargetOf,
  type Direction,
} from "@/lib/dock/nav-geo";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/** Focus the previous (-1) or next (+1) tab in the focused panel's group. */
function dockFocusNeighbor(dir: 1 | -1): void {
  const dock = useDockStore.getState();
  const state = dock.activeProjectId
    ? (dock.projects[dock.activeProjectId] ?? null)
    : null;
  if (!state) return;
  const focused = focusedPanelId(state);
  const wsEntry = state.workspaces[state.activeWorkspace];
  const holder = findHolder(wsEntry.tree, focused);
  if (!holder || holder.type !== "tabs" || holder.pages.length < 2) return;
  const idx = holder.pages.indexOf(focused);
  const next =
    holder.pages[(idx + dir + holder.pages.length) % holder.pages.length];
  dock.focus(next);
}

/** Close the currently focused dock panel. */
function dockCloseFocused(): void {
  const dock = useDockStore.getState();
  const state = dock.activeProjectId
    ? (dock.projects[dock.activeProjectId] ?? null)
    : null;
  if (!state) return;
  dock.close(focusedPanelId(state));
}

/** The live project's dock state, or null. */
function dockState() {
  const dock = useDockStore.getState();
  return dock.activeProjectId ? (dock.projects[dock.activeProjectId] ?? null) : null;
}

/** Move focus to the group left/right/above/below the focused one. */
function dockMoveFocus(dir: Direction): void {
  const state = dockState();
  if (!state) return;
  const dock = useDockStore.getState();
  const tree = state.workspaces[state.activeWorkspace].tree;
  const holder = findHolder(tree, focusedPanelId(state));
  if (!holder) return;
  const el = document.querySelector<HTMLElement>("[data-dock-workspace]");
  if (!el) return;
  const box = el.getBoundingClientRect();
  const rects = layoutRects(tree, {
    x: box.left,
    y: box.top,
    width: box.width,
    height: box.height,
  });
  const next = neighborInDirection(rects, holder.id, dir);
  if (!next) return;
  const panel = focusTargetOf(tree, next);
  if (panel) dock.focus(panel);
}

/** Run one dock keymap action against the focused panel. */
function runDockAction(action: DockKeyAction): void {
  const state = dockState();
  if (!state) return;
  const focused = focusedPanelId(state);
  const dock = useDockStore.getState();
  switch (action.kind) {
    case "cycle-tab":
      dockFocusNeighbor(action.dir);
      return;
    case "move-focus":
      dockMoveFocus(action.dir);
      return;
    case "close-focused":
      dock.close(focused);
      return;
    case "float-focused":
      dock.float(focused, { x: 160, y: 120 });
      return;
    case "toggle-maximize":
      dock.toggleMaximize(pageIdOf(focused));
      return;
    case "toggle-collapse":
      dock.toggleCollapse(pageIdOf(focused));
      return;
  }
}

/**
 * Wires the global keyboard shortcuts:
 *   ⌘/Ctrl+K  command palette
 *   ⌘/Ctrl+/  global search
 *   ⌘/Ctrl+B  toggle sidebar
 *   ?         shortcuts cheatsheet (when not typing)
 *   Dock (when enabled):
 *   Alt+←/→              focus prev/next tab in the focused group
 *   Alt+Shift+←/→/↑/↓    move focus to the group on that side
 *   Alt+F/M/C/W          float / maximize / collapse / close the focused panel
 *   Ctrl+Shift+K         close the focused panel
 */
export function useGlobalHotkeys(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "k" && !e.shiftKey) {
        e.preventDefault();
        useUIStore.setState((s) => ({ paletteOpen: !s.paletteOpen }));
        return;
      }
      if (mod && e.key === "/") {
        e.preventDefault();
        useUIStore.setState((s) => ({ searchOpen: !s.searchOpen }));
        return;
      }
      if (mod && key === "b") {
        e.preventDefault();
        useUIStore.getState().toggleSidebar();
        return;
      }
      if (mod && e.shiftKey && key === "k") {
        if (!useUIStore.getState().dockEnabled) return;
        e.preventDefault();
        dockCloseFocused();
        return;
      }
      // Dock grammar (Alt-based). Never steal keys from a text field, and only
      // when the dock is the layout in use.
      const action = dockActionFor(e);
      if (action) {
        if (!useUIStore.getState().dockEnabled) return;
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        runDockAction(action);
        return;
      }
      if (e.key === "?" && !isEditableTarget(e.target)) {
        e.preventDefault();
        useUIStore.getState().setShortcutsOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
