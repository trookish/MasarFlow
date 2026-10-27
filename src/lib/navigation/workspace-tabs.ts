import { focusedPanelId } from "@/lib/dock/dock-core";
import { collectPages } from "@/lib/dock/tree";
import type { ProjectDockState } from "@/lib/dock/types";
import { pageIdOf, paramsOf } from "@/lib/dock/types";
import { resolveLegacyUrl } from "@/lib/navigation/redirects";

export const WORKSPACE_TAB_GROUP_ID = "workspace-tabs";

/** A new project starts with one calm, useful destination rather than a preset split layout. */
export function defaultWorkspaceTabsState(): ProjectDockState {
  return {
    version: 2,
    activeWorkspace: "Workspace",
    workspaces: {
      Workspace: {
        tree: {
          type: "tabs",
          id: WORKSPACE_TAB_GROUP_ID,
          pages: ["/today"],
          activePage: "/today",
        },
        params: {},
      },
    },
    floaters: [],
    collapsedPanels: [],
    maximizedPanelId: null,
    focusGroupId: WORKSPACE_TAB_GROUP_ID,
  };
}

/** The linear tab order for the active project workspace. */
export function workspaceTabIds(state: ProjectDockState): string[] {
  const workspace = state.workspaces[state.activeWorkspace];
  if (!workspace) return [];
  return collectPages(workspace.tree);
}

/**
 * One-way migration from the old window manager. The active workspace's pages and their selection
 * snapshots survive; splits, floating windows, collapse/maximize state and named presets do not.
 */
export function normalizeWorkspaceTabs(state: ProjectDockState): ProjectDockState {
  const activeWorkspace =
    state.workspaces[state.activeWorkspace] ?? Object.values(state.workspaces)[0];
  if (!activeWorkspace) return defaultWorkspaceTabsState();

  const focused = focusedPanelId(state);
  const canonical = (panelId: string) =>
    resolveLegacyUrl(pageIdOf(panelId), paramsOf(panelId)) ?? panelId;
  const pages = [
    ...collectPages(activeWorkspace.tree),
    ...state.collapsedPanels,
    ...state.floaters.flatMap((floater) => floater.panelIds),
  ]
    .map(canonical)
    .filter((page, index, all) => all.indexOf(page) === index);
  if (pages.length === 0) pages.push("/today");

  const focusedCanonical = canonical(focused);
  const activePage = pages.includes(focusedCanonical) ? focusedCanonical : pages[0];
  const openPaths = new Set(pages.map(pageIdOf));
  const params = Object.fromEntries(
    Object.entries(activeWorkspace.params)
      .map(([panelId, value]) => [canonical(panelId), value] as const)
      .filter(([panelId]) => openPaths.has(pageIdOf(panelId))),
  );

  return {
    version: 2,
    activeWorkspace: "Workspace",
    workspaces: {
      Workspace: {
        tree: {
          type: "tabs",
          id: WORKSPACE_TAB_GROUP_ID,
          pages,
          activePage,
        },
        params,
      },
    },
    floaters: [],
    collapsedPanels: [],
    maximizedPanelId: null,
    focusGroupId: WORKSPACE_TAB_GROUP_ID,
  };
}

/** Previous/next tab with wrapping; a missing active tab selects the first. */
export function adjacentTabId(
  tabs: readonly string[],
  activeTab: string,
  direction: 1 | -1,
): string | null {
  if (tabs.length === 0) return null;
  const index = tabs.indexOf(activeTab);
  if (index < 0) return tabs[0];
  return tabs[(index + direction + tabs.length) % tabs.length];
}
