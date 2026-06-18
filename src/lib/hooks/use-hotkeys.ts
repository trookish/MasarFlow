"use client";

import { useEffect } from "react";
import { useUIStore } from "@/lib/stores/ui";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/**
 * Wires the global keyboard shortcuts:
 *   ⌘/Ctrl+K  command palette
 *   ⌘/Ctrl+/  global search
 *   ⌘/Ctrl+B  toggle sidebar
 *   ?         shortcuts cheatsheet (when not typing)
 */
export function useGlobalHotkeys(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "k") {
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
      if (e.key === "?" && !isEditableTarget(e.target)) {
        e.preventDefault();
        useUIStore.getState().setShortcutsOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
