import { describe, expect, it } from "vitest";
import {
  applyUrlFocus,
  closeEverywhere,
  focusedPanelId,
  urlOfFocused,
} from "@/lib/dock/dock-core";
import type { DockNode, ProjectDockState } from "@/lib/dock/types";
import { PLACEHOLDER_NODE_ID } from "@/lib/dock/tree";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const page = (id: string, pageId: string): DockNode => ({
  type: "page",
  id,
  pageId,
});
const tabs = (id: string, activePage: string, pages: string[]): DockNode => ({
  type: "tabs",
  id,
  activePage,
  pages,
});
const split = (
  id: string,
  direction: "horizontal" | "vertical",
  ratio: number,
  a: DockNode,
  b: DockNode,
): DockNode => ({ type: "split", id, direction, ratio, children: [a, b] });

const BRAIN = page("p-brain", "/brain");
const TASKS = page("p-tasks", "/tasks");

function baseState(tree: DockNode): ProjectDockState {
  return {
    version: 2,
    activeWorkspace: "Development",
    workspaces: { Development: { tree, params: {} } },
    floaters: [],
    collapsedPanels: [],
    maximizedPanelId: null,
    focusGroupId: null,
  };
}

const treeOf = (s: ProjectDockState): DockNode =>
  s.workspaces[s.activeWorkspace].tree;

// ---------------------------------------------------------------------------
// focusedPanelId / urlOfFocused
// ---------------------------------------------------------------------------

describe("focusedPanelId", () => {
  it("prefers the maximized panel", () => {
    const s = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    s.maximizedPanelId = "/tasks";
    expect(focusedPanelId(s)).toBe("/tasks");
  });

  it("uses the focus group's active tab", () => {
    const s = baseState(tabs("t-a", "/brain", ["/brain", "/tasks"]));
    s.focusGroupId = "t-a";
    expect(focusedPanelId(s)).toBe("/brain");
  });

  it("falls back to the first panel in the tree", () => {
    const s = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    expect(focusedPanelId(s)).toBe("/brain");
  });

  it("falls back to the top non-minimized floater when the tree is empty", () => {
    const s = baseState({ type: "page", id: PLACEHOLDER_NODE_ID, pageId: "/dashboard" });
    s.floaters = [
      {
        id: "f1",
        panelIds: ["/chat"],
        activePanel: "/chat",
        x: 0,
        y: 0,
        width: 560,
        height: 420,
        z: 1,
        minimized: false,
        maximized: false,
      },
      {
        id: "f2",
        panelIds: ["/search"],
        activePanel: "/search",
        x: 0,
        y: 0,
        width: 560,
        height: 420,
        z: 5,
        minimized: true,
        maximized: false,
      },
      {
        id: "f3",
        panelIds: ["/agents"],
        activePanel: "/agents",
        x: 0,
        y: 0,
        width: 560,
        height: 420,
        z: 3,
        minimized: false,
        maximized: false,
      },
    ];
    // f2 (top z) is minimized -> f3 wins.
    expect(focusedPanelId(s)).toBe("/agents");
  });
});

describe("urlOfFocused", () => {
  it("joins the focused panel path with its params snapshot", () => {
    const s = baseState(tabs("t-a", "/brain", ["/brain", "/tasks"]));
    s.focusGroupId = "t-a";
    s.workspaces.Development.params["/brain"] = "note=9";
    expect(urlOfFocused(s)).toBe("/brain?note=9");
  });

  it("returns the bare path when no params are snapshotted", () => {
    const s = baseState(BRAIN);
    expect(urlOfFocused(s)).toBe("/brain");
  });
});

// ---------------------------------------------------------------------------
// applyUrlFocus
// ---------------------------------------------------------------------------

describe("applyUrlFocus", () => {
  it("opens a missing panel in the workspace tree", () => {
    const s = applyUrlFocus(baseState(BRAIN), "/tasks");
    const tree = treeOf(s);
    expect(tree.type).toBe("tabs");
    if (tree.type !== "tabs") return;
    expect(tree.pages).toEqual(["/brain", "/tasks"]);
    expect(tree.activePage).toBe("/tasks");
    expect(s.focusGroupId).toBe(tree.id);
  });

  it("focuses an existing panel and snapshots its query params", () => {
    const s0 = baseState(tabs("t-a", "/tasks", ["/brain", "/tasks"]));
    const s = applyUrlFocus(s0, "/brain?note=abc");
    expect(s.workspaces.Development.params["/brain"]).toBe("note=abc");
    expect(treeOf(s)).toEqual(tabs("t-a", "/brain", ["/brain", "/tasks"]));
  });

  it("does not touch params when the URL has no query", () => {
    const s0 = baseState(tabs("t-a", "/tasks", ["/brain", "/tasks"]));
    s0.workspaces.Development.params["/brain"] = "note=keep";
    const s = applyUrlFocus(s0, "/brain");
    expect(s.workspaces.Development.params["/brain"]).toBe("note=keep");
  });

  it("updates the snapshot when the query changes", () => {
    const s0 = baseState(tabs("t-a", "/brain", ["/brain", "/tasks"]));
    s0.workspaces.Development.params["/brain"] = "note=old";
    const s = applyUrlFocus(s0, "/brain?note=new");
    expect(s.workspaces.Development.params["/brain"]).toBe("note=new");
  });
});

// ---------------------------------------------------------------------------
// floatPanel / dockFloater / floater ops
// ---------------------------------------------------------------------------

describe("closeEverywhere", () => {
  it("closes a tree panel and clears its legacy maximize/collapse state", () => {
    const s0 = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    s0.maximizedPanelId = "/brain";
    s0.collapsedPanels = ["/brain"];
    const s = closeEverywhere(s0, "/brain");
    expect(treeOf(s)).toEqual(page("p-tasks", "/tasks"));
    expect(s.maximizedPanelId).toBeNull();
    expect(s.collapsedPanels).toEqual([]);
  });

  it("removes a panel from a legacy floater and discards the emptied floater", () => {
    const s0 = baseState(TASKS);
    s0.floaters = [
      {
        id: "f1",
        panelIds: ["/brain"],
        activePanel: "/brain",
        x: 0,
        y: 0,
        width: 560,
        height: 420,
        z: 1,
        minimized: false,
        maximized: false,
      },
    ];
    const s = closeEverywhere(s0, "/brain");
    expect(s.floaters).toHaveLength(0);
    expect(treeOf(s)).toEqual(TASKS);
  });

  it("drops the closed tab's params snapshot", () => {
    const s0 = applyUrlFocus(baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS)), "/tasks?task=t1");
    const s = closeEverywhere(s0, "/tasks");
    expect(s.workspaces[s.activeWorkspace].params["/tasks"]).toBeUndefined();
  });
});
