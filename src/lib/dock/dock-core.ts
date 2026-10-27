/**
 * Core state transitions for the project tab strip, above the tree level:
 * which tab is focused, URL -> tab sync, and closing a tab. Pure functions
 * over ProjectDockState; the zustand store is a thin wrapper around these.
 *
 * Persisted states from 0.2 may still carry floaters, collapsed panels, or
 * a maximized panel. normalizeWorkspaceTabs folds them into the single tab
 * group; the reducers here tolerate them so an un-normalized state never
 * loses a tab.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode, ProjectDockState } from "./types";
import { closePanel, collectPages, openPanel, PLACEHOLDER_NODE_ID } from "./tree";
import { joinPanelId, pageIdOf, paramsOf } from "./types";

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

/**
 * The tab the workspace is currently "on" — the URL mirror target:
 * legacy maximized panel > focus group's active tab > first tab >
 * legacy floater's active panel > "/today".
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
  // A placeholder-only tree counts as empty; a real page does not.
  const placeholderOnly =
    tree.type === "page" && tree.id === PLACEHOLDER_NODE_ID;
  if (!placeholderOnly && first) return first;

  const float = s.floaters
    .filter((f) => !f.minimized)
    .sort((a, b) => b.z - a.z)[0];
  if (float) return float.activePanel;
  return first ?? "/today";
}

/** The focused tab's URL: path + its params snapshot. */
export function urlOfFocused(s: ProjectDockState): string {
  const panel = focusedPanelId(s);
  const query = ws(s).params[panel];
  return query ? joinPanelId(pageIdOf(panel), query) : pageIdOf(panel);
}

/**
 * URL -> tabs: focus or open the tab for `panelId` (path + optional query).
 * A query in the URL snapshots onto the tab's params (overwriting).
 * Tabs are identified by path; the query is a snapshot, not identity.
 */
export function applyUrlFocus(
  s: ProjectDockState,
  panelId: string,
): ProjectDockState {
  const query = paramsOf(panelId);
  const path = pageIdOf(panelId);

  const params = { ...ws(s).params };
  if (query) params[path] = query;

  // A tab still parked in a legacy floater only records its params; the
  // next normalize pass moves it into the strip.
  const inFloater = s.floaters.some((f) => f.panelIds.includes(path));
  const inTree = collectPages(ws(s).tree).includes(path);
  if (inFloater && !inTree) return withWs(s, undefined, params);

  const res = openPanel(ws(s).tree, path, s.focusGroupId);
  return { ...withWs(s, res.tree, params), focusGroupId: res.focusGroupId };
}

/**
 * Close a tab everywhere it may live (strip, legacy floater, legacy
 * collapsed list) and drop its params snapshot.
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
                ? (f.panelIds.filter((p) => p !== panelId)[0] ?? "")
                : f.activePanel,
          }
        : f,
    )
    .filter((f) => f.panelIds.length > 0);

  const collapsedPanels = s.collapsedPanels.filter((p) => p !== panelId);
  const maximizedPanelId =
    s.maximizedPanelId === panelId ? null : s.maximizedPanelId;

  const params = { ...ws(s).params };
  delete params[panelId];

  const next = withWs(s, tree, params);
  const focusGroupId =
    next.focusGroupId && !findGroupById(tree, next.focusGroupId)
      ? null
      : next.focusGroupId;
  return { ...next, floaters, collapsedPanels, maximizedPanelId, focusGroupId };
}
