/**
 * The dock's keyboard grammar, as a pure function so it can be tested and
 * documented in one place. Everything is on Alt because the desktop app has no
 * menu bar (the Electron menu is removed in P1.T5), so Alt+letter is free —
 * and Alt+arrows/data keys do not collide with text editing.
 *
 *   Alt+← / Alt+→              previous / next tab in the focused group
 *   Alt+Shift+← / → / ↑ / ↓    move focus to the group on that side
 *   Alt+F                      float the focused panel
 *   Alt+M                      maximize / restore it
 *   Alt+C                      collapse / restore it (slim bar)
 *   Alt+W                      close it (Ctrl+Shift+K also works)
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { Direction } from "./nav-geo";

export type DockKeyAction =
  | { kind: "cycle-tab"; dir: 1 | -1 }
  | { kind: "close-focused" }
  | { kind: "float-focused" }
  | { kind: "toggle-maximize" }
  | { kind: "toggle-collapse" }
  | { kind: "move-focus"; dir: Direction };

export interface KeyLike {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function dockActionFor(e: KeyLike): DockKeyAction | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  const key = e.key.toLowerCase();

  if (key === "arrowleft") {
    return e.shiftKey ? { kind: "move-focus", dir: "left" } : { kind: "cycle-tab", dir: -1 };
  }
  if (key === "arrowright") {
    return e.shiftKey ? { kind: "move-focus", dir: "right" } : { kind: "cycle-tab", dir: 1 };
  }
  if (key === "arrowup" && e.shiftKey) return { kind: "move-focus", dir: "up" };
  if (key === "arrowdown" && e.shiftKey) return { kind: "move-focus", dir: "down" };
  if (key === "f") return { kind: "float-focused" };
  if (key === "m") return { kind: "toggle-maximize" };
  if (key === "c") return { kind: "toggle-collapse" };
  if (key === "w") return { kind: "close-focused" };
  return null;
}
