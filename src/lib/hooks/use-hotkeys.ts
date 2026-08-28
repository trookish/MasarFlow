"use client";

import { useEffect } from "react";
import { useUIStore } from "@/lib/stores/ui";
import { useDockStore } from "@/lib/stores/dock";
import { focusedPanelId } from "@/lib/dock/dock-core";
import { findHolder } from "@/lib/dock/tree";

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

/**
 * Wires the global keyboard shortcuts:
 *   ⌘/Ctrl+K  command palette
 *   ⌘/Ctrl+/  global search
 *   ⌘/Ctrl+B  toggle sidebar
 *   ?         shortcuts cheatsheet (when not typing)
 *   Dock (when enabled):
 *   Alt+←/→   focus prev/next tab in the focused group
 *   Ctrl+Shift+K  close the focused panel
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
      if (e.altKey && key === "arrowleft") {
        if (!useUIStore.getState().dockEnabled) return;
        e.preventDefault();
        dockFocusNeighbor(-1);
        return;
      }
      if (e.altKey && key === "arrowright") {
        if (!useUIStore.getState().dockEnabled) return;
        e.preventDefault();
        dockFocusNeighbor(1);
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
