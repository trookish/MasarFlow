/**
 * Where a panel lives, and the "one panel per path" invariant.
 *
 * Panel identity is the PATH: "/brain?note=abc" is the page "/brain" plus a
 * query snapshot held in the workspace's `params` map (see types.ts:1-7 and
 * dock-core.ts:130-166). Consequences the UI must respect:
 *
 * 1. Two panels of the same path cannot exist through normal use — the dock
 *    focuses the existing one instead of opening a second copy. A duplicate
 *    can only arrive from a hand-edited localStorage payload or an imported
 *    layout file, which is why this module exists: tests pin the invariant and
 *    callers can ask "is this already open?" before offering to open it.
 * 2. There is therefore no "two editors, one record" conflict inside the dock.
 *    The residual conflict story is narrower and already handled elsewhere:
 *    page components read through Dexie's live queries, so an edit made
 *    anywhere (another panel, a chat tool call, a background job) re-renders
 *    the open panel; the only way to lose work is an *unsaved draft* inside a
 *    kept-alive panel being overwritten by a newer record — out of scope for
 *    0.2 (recorded as R-P8-4), mitigated by the activity feed showing the
 *    change (P5) and by editors saving on blur.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode, ProjectDockState } from "./types";
import { pageIdOf } from "./types";
import { collectPages, findNode } from "./tree";

export interface PanelSlot {
  kind: "tree" | "floater" | "collapsed";
  /** Owning node id (kind "tree") or floater id (kind "floater"). */
  ownerId?: string;
}

export interface LocatedPanel {
  panelId: string;
  slot: PanelSlot;
}

/** Node id of the group holding a panel, or null. */
function treeOwner(tree: DockNode, panelId: string): string | null {
  if (tree.type === "page") return tree.pageId === panelId ? tree.id : null;
  if (tree.type === "tabs") return tree.pages.includes(panelId) ? tree.id : null;
  for (const child of tree.children) {
    const hit = treeOwner(child, panelId);
    if (hit) return hit;
  }
  return null;
}

/**
 * Every panel whose path equals `path` (queries ignored), with where it lives.
 * Returns 0 or 1 entry in practice — the invariant test proves it.
 */
export function panelsForPath(state: ProjectDockState, path: string): LocatedPanel[] {
  const entry = state.workspaces[state.activeWorkspace];
  if (!entry) return [];
  const out: LocatedPanel[] = [];

  for (const panelId of collectPages(entry.tree)) {
    if (pageIdOf(panelId) !== path) continue;
    const owner = treeOwner(entry.tree, panelId);
    out.push({ panelId, slot: { kind: "tree", ownerId: owner ?? undefined } });
  }
  for (const floater of state.floaters) {
    for (const panelId of floater.panelIds) {
      if (pageIdOf(panelId) !== path) continue;
      out.push({ panelId, slot: { kind: "floater", ownerId: floater.id } });
    }
  }
  for (const panelId of state.collapsedPanels) {
    if (pageIdOf(panelId) !== path) continue;
    out.push({ panelId, slot: { kind: "collapsed" } });
  }
  return out;
}

/** Where a specific panel id lives, or null when it is not open. */
export function slotOf(state: ProjectDockState, panelId: string): PanelSlot | null {
  return panelsForPath(state, pageIdOf(panelId)).find((p) => p.panelId === panelId)?.slot ?? null;
}

/** True when the page for `panelId` is already open somewhere in the dock. */
export function isPathOpen(state: ProjectDockState, path: string): boolean {
  return panelsForPath(state, path).length > 0;
}

/** Node lookup used by callers that need the owning group node. */
export function owningNode(state: ProjectDockState, panelId: string): DockNode | null {
  const owner = treeOwner(state.workspaces[state.activeWorkspace].tree, panelId);
  return owner ? findNode(state.workspaces[state.activeWorkspace].tree, owner) : null;
}
/* The path half of a panel id is `pageIdOf` from ./types — the invariant
 * module deliberately does not introduce a second name for the same idea. */
