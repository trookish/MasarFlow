/**
 * Default workspace presets for the MasarFlow dock window manager.
 *
 * Each project starts with four named workspaces. Trees are built fresh per
 * call so consumers never share node objects.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode, ProjectDockState } from "./types";
import { newId } from "./types";

export interface WorkspacePreset {
  tree: DockNode;
  params: Record<string, string | undefined>;
}

const pageNode = (pageId: string): DockNode => ({
  type: "page",
  id: newId("page"),
  pageId,
});

const tabsNode = (pages: string[]): DockNode => ({
  type: "tabs",
  id: newId("tabs"),
  activePage: pages[0],
  pages: [...pages],
});

const splitNode = (
  direction: "horizontal" | "vertical",
  a: DockNode,
  b: DockNode,
): DockNode => ({
  type: "split",
  id: newId("split"),
  direction,
  ratio: 0.5,
  children: [a, b],
});

function buildPresets(): Record<string, WorkspacePreset> {
  return {
    // Code + AI assistant side by side.
    Development: {
      tree: splitNode("horizontal", pageNode("/dashboard"), pageNode("/chat")),
      params: {},
    },
    // Spec/task planning stacked over standards.
    Planning: {
      tree: splitNode(
        "vertical",
        tabsNode(["/specs", "/tasks"]),
        pageNode("/standards"),
      ),
      params: {},
    },
    // Dev logs next to the knowledge graph.
    Debugging: {
      tree: splitNode("horizontal", pageNode("/devlogs"), pageNode("/knowledge")),
      params: {},
    },
    // AI chat beside semantic search.
    "AI Research": {
      tree: splitNode("horizontal", pageNode("/chat"), pageNode("/search")),
      params: {},
    },
  };
}

/** The four seeded workspaces (fresh node objects per call). */
export const WORKSPACE_PRESETS: Record<string, WorkspacePreset> = buildPresets();

/** A fresh per-project dock state, starting on Development. */
export function defaultProjectState(): ProjectDockState {
  const presets = buildPresets();
  return {
    version: 2,
    activeWorkspace: "Development",
    workspaces: {
      Development: presets.Development,
      Planning: presets.Planning,
      Debugging: presets.Debugging,
      "AI Research": presets["AI Research"],
    },
    floaters: [],
    collapsedPanels: [],
    maximizedPanelId: null,
    focusGroupId: null,
  };
}
