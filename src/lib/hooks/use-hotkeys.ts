"use client";

import { useEffect } from "react";
import { useUIStore } from "@/lib/stores/ui";
import { useDockStore } from "@/lib/stores/dock";
import { focusedPanelId } from "@/lib/dock/dock-core";
import { findHolder } from "@/lib/dock/tree";
import { workspaceTabIds } from "@/lib/navigation/workspace-tabs";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function focusedTab() {
  const dock = useDockStore.getState();
  const state = dock.getProject();
  if (!state) return null;
  const panelId = focusedPanelId(state);
  const workspace = state.workspaces[state.activeWorkspace];
  const holder = findHolder(workspace.tree, panelId);
  return { dock, panelId, tabs: workspaceTabIds(state), holder };
}

/** Global keyboard shortcuts for surfaces, project tabs, and overlays. */
export function useGlobalHotkeys(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const ui = useUIStore.getState();

      if (mod && key === "k" && !e.shiftKey) {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      if (mod && key === "o" && !e.shiftKey) {
        e.preventDefault();
        ui.setQuickSwitchOpen(!ui.quickSwitchOpen);
        return;
      }
      if (mod && e.key === "/") {
        e.preventDefault();
        ui.setSearchOpen(!ui.searchOpen);
        return;
      }
      if (mod && key === "b" && !e.shiftKey) {
        e.preventDefault();
        ui.toggleNavigation();
        return;
      }
      if (mod && e.shiftKey && key === "t") {
        e.preventDefault();
        useDockStore.getState().reopenClosedTab();
        return;
      }
      if (e.key === "?" && !isEditableTarget(e.target)) {
        e.preventDefault();
        ui.setShortcutsOpen(true);
        return;
      }
      if (isEditableTarget(e.target)) return;

      const current = focusedTab();
      if (!current) return;
      const { dock, panelId, tabs, holder } = current;
      const index = tabs.indexOf(panelId);

      if (mod && e.key === "Tab") {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        dock.focus(tabs[(index + delta + tabs.length) % tabs.length]);
      } else if (mod && key === "w") {
        e.preventDefault();
        dock.close(panelId);
      } else if (mod && e.shiftKey && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        const delta = e.key === "[" ? -1 : 1;
        dock.focus(tabs[(index + delta + tabs.length) % tabs.length]);
      } else if (mod && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const target = tabs[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          dock.focus(target);
        }
      } else if (e.altKey && e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        if (!holder || holder.type !== "tabs") return;
        const nextIndex = Math.max(0, Math.min(tabs.length - 1, index + (e.key === "ArrowLeft" ? -1 : 1)));
        dock.reorder(holder.id, panelId, nextIndex);
        dock.focus(panelId);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
