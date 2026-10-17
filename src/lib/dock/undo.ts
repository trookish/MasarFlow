/**
 * In-memory undo history for dock mutations that a user cannot see coming:
 * closing a panel, resetting a workspace, deleting a workspace.
 *
 * Deliberately NOT persisted (undo across an app restart is a different
 * feature) and deliberately NOT part of ProjectDockState (it must never be
 * serialized). One ring per project, newest last, vanishing beyond 10 steps;
 * snapshots are structurally cloned on write, so neither a later dock reducer
 * nor a caller still holding the previous state can corrupt what undo restores.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { ProjectDockState } from "./types";

export interface UndoEntry {
  /** Human label used in the toast: "Closed Task Boards". */
  label: string;
  /** When it was recorded (ms epoch). */
  at: number;
  /** The full project dock state before the mutation. */
  state: ProjectDockState;
}

/** How many steps a project can undo. */
export const MAX_UNDO = 10;

const HISTORY = new Map<string, UndoEntry[]>();

/** Structural clone — a snapshot must never alias the caller's live state. */
function cloneState(state: ProjectDockState): ProjectDockState {
  return typeof structuredClone === "function"
    ? structuredClone(state)
    : (JSON.parse(JSON.stringify(state)) as ProjectDockState);
}

/** Record `state` as the state to return to (cloned, so later edits cannot reach it). */
export function rememberUndo(
  projectId: string,
  label: string,
  state: ProjectDockState,
  at: number = Date.now(),
): void {
  const stack = HISTORY.get(projectId) ?? [];
  stack.push({ label, at, state: cloneState(state) });
  if (stack.length > MAX_UNDO) stack.splice(0, stack.length - MAX_UNDO);
  HISTORY.set(projectId, stack);
}

/** The next entry that `takeUndo` would return, without consuming it. */
export function peekUndo(projectId: string): UndoEntry | null {
  const stack = HISTORY.get(projectId);
  return stack && stack.length > 0 ? stack[stack.length - 1] : null;
}

/** Consume and return the newest entry, or null when there is none. */
export function takeUndo(projectId: string): UndoEntry | null {
  const stack = HISTORY.get(projectId);
  if (!stack || stack.length === 0) return null;
  const entry = stack.pop() as UndoEntry;
  if (stack.length === 0) HISTORY.delete(projectId);
  return entry;
}

/** How many steps are available for a project. */
export function undoDepth(projectId: string): number {
  return HISTORY.get(projectId)?.length ?? 0;
}

/** Test/debug helper: drop one project's history, or all of it. */
export function clearUndo(projectId?: string): void {
  if (projectId) HISTORY.delete(projectId);
  else HISTORY.clear();
}
