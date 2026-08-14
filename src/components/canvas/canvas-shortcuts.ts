"use client";

import { useEffect, useRef } from "react";

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
  // Latest handlers in a ref so the listener attaches once instead of being
  // torn down and re-attached on every render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Never intercept when typing in inputs, textareas, or CodeMirror.
      if (isEditableTarget(e.target) || isInCodeMirror(e.target)) return;

      const h = handlersRef.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Ctrl/Cmd+N → new text card
      if (mod && key === "n") {
        e.preventDefault();
        h.onNewText();
        return;
      }
      // Ctrl/Cmd+D → duplicate selected
      if (mod && key === "d") {
        e.preventDefault();
        h.onDuplicate();
        return;
      }
      // Ctrl/Cmd+G → group selected
      if (mod && key === "g") {
        e.preventDefault();
        h.onGroup();
        return;
      }
      // Ctrl/Cmd+A → select all
      if (mod && key === "a") {
        e.preventDefault();
        h.onSelectAll();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
