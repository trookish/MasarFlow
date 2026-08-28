/**
 * Core state transitions for the MasarFlow dock window manager — everything
 * above the tree level: URL sync, floating windows, collapse/maximize, and
 * workspaces. Pure functions over ProjectDockState; the zustand store is a
 * thin wrapper around these.
 *
 * Floater ids are generated here and surfaced to the UI via the returned
 * state (s.floaters) — callers never construct ids.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode, DockZone, FloatWindow, ProjectDockState } from "./types";
import {
  closePanel,
  collectPages,
  findHolder,
  insertPanel,
  newId,
  normalizeTree,
  openPanel,
  PLACEHOLDER_NODE_ID,
} from "./tree";
import { joinPanelId, pageIdOf, paramsOf } from "./types";

/** Default floater geometry when a panel is undocked. */
const FLOATER_W = 560;
const FLOATER_H = 420;

type WsEntry = { tree: DockNode; params: Record<string, string | undefined> };

/** The workspace whose tree/params are live. */
function ws(s: ProjectDockState): WsEntry {
  return s.workspaces[s.activeWorkspace];
}

/** Copy-on-write helper: clone the state shallowly + clone the live workspace. */
function withWs(
  s: ProjectDockState,
  tree?: DockNode,
  params?: Record<string, string | undefined>,
): ProjectDockState {
  return {
    ...s,
    workspaces: {
      ...s.workspaces,
      [s.activeWorkspace]: {
        tree: tree ?? ws(s).tree,
        params: params ?? { ...ws(s).params },
      },
    },
  };
}

/** Next floater z-index: above every existing floater. */
function nextZ(s: ProjectDockState): number {
  return s.floaters.reduce((m, f) => Math.max(m, f.z), 0) + 1;
}

/** True when the tree contains the panel (floaters/collapsed not included). */
function treeContains(tree: DockNode, panelId: string): boolean {
  return collectPages(tree).includes(panelId);
}

/** Every panel known to the dock state: tree + floaters + collapsed. */
function allKnownPanels(s: ProjectDockState): string[] {
  const known = new Set<string>([
    ...collectPages(ws(s).tree),
    ...s.collapsedPanels,
  ]);
  for (const f of s.floaters) for (const p of f.panelIds) known.add(p);
  return [...known];
}

// === PART 2: focus + url sync ===
/**
 * The panel the workspace is currently "on" — the URL mirror target:
 * maximized panel > focus group's active tab > first tree panel > top
 * non-minimized floater's active panel > "/dashboard".
 */
export function focusedPanelId(s: ProjectDockState): string {
  const tree = ws(s).tree;
  if (s.maximizedPanelId) return s.maximizedPanelId;

  if (s.focusGroupId) {
    const group = findGroupById(tree, s.focusGroupId);
    if (group) {
      if (group.type === "tabs") return group.activePage;
      if (group.type === "page") return group.pageId;
    }
  }

  const first = collectPages(tree)[0];
  // A placeholder-only tree counts as empty (floaters may hold the real
  // focus); a real "/dashboard" page does not (its node id differs).
  const placeholderOnly =
    tree.type === "page" && tree.id === PLACEHOLDER_NODE_ID;
  if (!placeholderOnly && first) return first;

  const float = s.floaters
    .filter((f) => !f.minimized)
    .sort((a, b) => b.z - a.z)[0];
  if (float) return float.activePanel;
  return first ?? "/dashboard";
}

/** Depth-first search for a tabs/page node by id. */
function findGroupById(tree: DockNode, id: string): DockNode | null {
  if (tree.id === id) return tree;
  if (tree.type === "split") {
    for (const child of tree.children) {
      const hit = findGroupById(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** The focused panel's URL: path + its params snapshot. */
export function urlOfFocused(s: ProjectDockState): string {
  const panel = focusedPanelId(s);
  const query = ws(s).params[panel];
  return query ? joinPanelId(pageIdOf(panel), query) : pageIdOf(panel);
}

/**
 * URL -> dock: focus or open the panel for `panelId` (path + optional query).
 * A query in the URL snapshots onto the panel's params (overwriting).
 */
export function applyUrlFocus(
  s: ProjectDockState,
  panelId: string,
): ProjectDockState {
  const query = paramsOf(panelId);
  const path = pageIdOf(panelId);

  const params = { ...ws(s).params };
  if (query) params[path] = query;

  // Target by path (query is a snapshot, not identity).
  const known = allKnownPanels(s);
  const inTree = treeContains(ws(s).tree, path);

  if (!known.includes(path) && !inTree) {
    // Brand-new panel: insert via openPanel (focus-or-insert).
    const res = openPanel(ws(s).tree, path, s.focusGroupId);
    return { ...withWs(s, res.tree, params), focusGroupId: res.focusGroupId };
  }

  if (inTree) {
    // Focus it in the tree.
    const res = openPanel(ws(s).tree, path, s.focusGroupId);
    return { ...withWs(s, res.tree, params), focusGroupId: res.focusGroupId };
  }

  // Panel exists but lives in a floater / collapsed list: record params and
  // re-point focusGroupId at its holder when findable.
  const floater = s.floaters.find((f) => f.panelIds.includes(path));
  if (floater) {
    return {
      ...withWs(s, undefined, params),
      focusGroupId: s.focusGroupId,
    };
  }
  return withWs(s, undefined, params);
}

// === PART 3: floaters ===
/**
 * Undock `panelId` into a floating window at `pos`. When the panel lives in
 * a tabs group with more than one page, the WHOLE group floats (matching
 * group-drag semantics). The tree is normalized (empty splits dissolve).
 */
export function floatPanel(
  s: ProjectDockState,
  panelId: string,
  pos: { x: number; y: number },
): ProjectDockState {
  const tree = ws(s).tree;
  const holder = findHolder(tree, panelId);
  if (!holder) return s; // unknown panel — no-op

  const panelIds =
    holder.type === "tabs"
      ? [...holder.pages]
      : holder.type === "page"
        ? [holder.pageId]
        : [];

  // Remove every floated panel from the tree, then normalize.
  let without = tree;
  for (const p of panelIds) without = closePanel(without, p);
  without = normalizeTree(without);

  const floater: FloatWindow = {
    id: newId("float"),
    panelIds,
    activePanel: panelId,
    x: pos.x,
    y: pos.y,
    width: FLOATER_W,
    height: FLOATER_H,
    z: nextZ(s),
    minimized: false,
    maximized: false,
  };

  const params = { ...ws(s).params };
  // Drop snapshots for panels removed by cleanup (they no longer exist).
  const remaining = new Set([
    ...collectPages(without),
    ...panelIds,
  ]);
  for (const key of Object.keys(params)) {
    if (!remaining.has(key)) delete params[key];
  }

  let next = withWs(s, without, params);
  // Clear a dangling focusGroupId (its holder may have been removed).
  if (next.focusGroupId && !findGroupById(without, next.focusGroupId)) {
    next = { ...next, focusGroupId: null };
  }
  if (next.maximizedPanelId && panelIds.includes(next.maximizedPanelId)) {
    next = { ...next, maximizedPanelId: null };
  }
  next.collapsedPanels = next.collapsedPanels.filter(
    (p) => !panelIds.includes(p),
  );
  return { ...next, floaters: [...s.floaters, floater] };
}

/**
 * Dock floater `floaterId` back into the tree at `target` ("root" or node id)
 * arriving from `zone`. All the floater's panels move (group insert).
 */
export function dockFloater(
  s: ProjectDockState,
  floaterId: string,
  target: string | "root",
  zone: DockZone,
): ProjectDockState {
  const floater = s.floaters.find((f) => f.id === floaterId);
  if (!floater) return s;

  const panels = [...floater.panelIds];

  // Build the payload group (tabs when multi-panel, page for a single panel)
  // with stable ids, then insert it wholesale at the target.
  const payload: DockNode =
    panels.length > 1
      ? {
          type: "tabs",
          id: floater.id,
          activePage: floater.activePanel,
          pages: panels,
        }
      : { type: "page", id: floater.id, pageId: panels[0] };

  const tree = insertPanel(ws(s).tree, payload, target, zone);

  const params = { ...ws(s).params };
  let next = withWs(s, tree, params);
  if (next.maximizedPanelId && panels.includes(next.maximizedPanelId)) {
    next = { ...next, maximizedPanelId: null };
  }
  return {
    ...next,
    floaters: s.floaters.filter((f) => f.id !== floaterId),
  };
}

/** Move a floater window (live drag). */
export function moveFloater(
  s: ProjectDockState,
  floaterId: string,
  pos: { x: number; y: number },
): ProjectDockState {
  return {
    ...s,
    floaters: s.floaters.map((f) =>
      f.id === floaterId ? { ...f, x: pos.x, y: pos.y } : f,
    ),
  };
}

/** Resize a floater window. */
export function resizeFloater(
  s: ProjectDockState,
  floaterId: string,
  size: { w: number; h: number },
): ProjectDockState {
  return {
    ...s,
    floaters: s.floaters.map((f) =>
      f.id === floaterId ? { ...f, width: size.w, height: size.h } : f,
    ),
  };
}

/** Raise a floater above all others (focus click). */
export function focusFloater(
  s: ProjectDockState,
  floaterId: string,
): ProjectDockState {
  const top = nextZ(s);
  return {
    ...s,
    floaters: s.floaters.map((f) =>
      f.id === floaterId ? { ...f, z: top } : f,
    ),
  };
}

/** Minimize/restore a floater. Minimizing clears a maximized flag. */
export function toggleFloaterMinimized(
  s: ProjectDockState,
  floaterId: string,
): ProjectDockState {
  return {
    ...s,
    floaters: s.floaters.map((f) =>
      f.id === floaterId
        ? { ...f, minimized: !f.minimized, maximized: false }
        : f,
    ),
  };
}

/** Maximize/restore a floater (fills the workspace above the tree). */
export function toggleFloaterMaximized(
  s: ProjectDockState,
  floaterId: string,
): ProjectDockState {
  return {
    ...s,
    floaters: s.floaters.map((f) =>
      f.id === floaterId ? { ...f, maximized: !f.maximized } : f,
    ),
  };
}

// === PART 4: close/collapse/maximize + workspaces ===
/**
 * Close a panel everywhere it may live: tree, floater, collapsed list.
 * Clears maximize/collapse state; discards a floater emptied by the close.
 */
export function closeEverywhere(
  s: ProjectDockState,
  panelId: string,
): ProjectDockState {
  const tree = closePanel(ws(s).tree, panelId);

  const floaters = s.floaters
    .map((f) =>
      f.panelIds.includes(panelId)
        ? {
            ...f,
            panelIds: f.panelIds.filter((p) => p !== panelId),
            activePanel:
              f.activePanel === panelId
                ? f.panelIds.filter((p) => p !== panelId)[0] ?? ""
                : f.activePanel,
          }
        : f,
    )
    .filter((f) => f.panelIds.length > 0);

  const collapsed = s.collapsedPanels.filter((p) => p !== panelId);
  const maximizedPanelId =
    s.maximizedPanelId === panelId ? null : s.maximizedPanelId;

  const params = { ...ws(s).params };
  delete params[panelId];

  const next = withWs(s, tree, params);
  // Clear a dangling focusGroupId.
  const focusGroupId =
    next.focusGroupId && !findGroupById(tree, next.focusGroupId)
      ? null
      : next.focusGroupId;
  return { ...next, floaters, collapsedPanels: collapsed, maximizedPanelId, focusGroupId };
}

/** Collapse/restore a tiled panel to a slim bar in its split slot. */
export function toggleCollapse(
  s: ProjectDockState,
  panelId: string,
): ProjectDockState {
  const has = s.collapsedPanels.includes(panelId);
  return {
    ...s,
    collapsedPanels: has
      ? s.collapsedPanels.filter((p) => p !== panelId)
      : [...s.collapsedPanels, panelId],
  };
}

/** Maximize/restore a tiled panel (fills the workspace). */
export function toggleMaximize(
  s: ProjectDockState,
  panelId: string,
): ProjectDockState {
  return {
    ...s,
    maximizedPanelId: s.maximizedPanelId === panelId ? null : panelId,
  };
}

/** Deep-clone a tree node (workspaces must not share node objects). */
function cloneTree(node: DockNode): DockNode {
  switch (node.type) {
    case "split":
      return { ...node, children: node.children.map(cloneTree) };
    case "tabs":
      return { ...node, pages: [...node.pages] };
    case "page":
      return { ...node };
  }
}

// ── Workspaces ──────────────────────────────────────────────────────────────

/**
 * Switch to a workspace by name; a missing one is created by cloning the
 * CURRENT workspace (so "New workspace" starts from what's on screen).
 */
export function switchWorkspace(
  s: ProjectDockState,
  name: string,
): ProjectDockState {
  if (s.workspaces[name]) {
    return { ...s, activeWorkspace: name };
  }
  return {
    ...s,
    activeWorkspace: name,
    workspaces: {
      ...s.workspaces,
      [name]: { tree: normalizeTree(cloneTree(ws(s).tree)), params: { ...ws(s).params } },
    },
  };
}

/** Save the live workspace under a new name and switch to the copy. */
export function saveWorkspaceAs(
  s: ProjectDockState,
  name: string,
): ProjectDockState {
  if (!name || s.workspaces[name]) return s; // no overwrite via save-as
  return {
    ...s,
    activeWorkspace: name,
    workspaces: {
      ...s.workspaces,
      [name]: { tree: normalizeTree(cloneTree(ws(s).tree)), params: { ...ws(s).params } },
    },
  };
}

/** Restore the active workspace to a preset tree (params cleared). */
export function resetWorkspace(
  s: ProjectDockState,
  presetTree: DockNode,
): ProjectDockState {
  return withWs(s, normalizeTree(presetTree), {});
}

// === PART 5: helpers ===
