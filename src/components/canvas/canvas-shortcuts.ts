"use client";

import { useEffect } from "react";

/**
 * Canvas-local keyboard shortcuts.
 *
 * These are scoped to the canvas board (mounted inside ReactFlowProvider)
 * and avoid conflicts with the global hotkeys (⌘K, ⌘/, ⌘B, ?) and the
 * RichMarkdownEditor (which has its own CodeMirror keybindings).
 *
 * Shortcuts:
 *   Ctrl/Cmd+N  → new text card at viewport center
 *   Ctrl/Cmd+D  → duplicate selected node(s)
 *   Ctrl/Cmd+G  → group selected nodes
 *   Delete      → delete selected (also handled by RF's deleteKeyCode)
 *   Ctrl/Cmd+A  → select all nodes
 */

interface CanvasShortcutHandlers {
  onNewText: () => void;
  onDuplicate: () => void;
  onGroup: () => void;
  onSelectAll: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function isInCodeMirror(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(".cm-editor") !== null;
}

export function useCanvasShortcuts(handlers: CanvasShortcutHandlers): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Never intercept when typing in inputs, textareas, or CodeMirror.
      if (isEditableTarget(e.target) || isInCodeMirror(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Ctrl/Cmd+N → new text card
      if (mod && key === "n") {
        e.preventDefault();
        handlers.onNewText();
        return;
      }
      // Ctrl/Cmd+D → duplicate selected
      if (mod && key === "d") {
        e.preventDefault();
        handlers.onDuplicate();
        return;
      }
      // Ctrl/Cmd+G → group selected
      if (mod && key === "g") {
        e.preventDefault();
        handlers.onGroup();
        return;
      }
      // Ctrl/Cmd+A → select all
      if (mod && key === "a") {
        e.preventDefault();
        handlers.onSelectAll();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
