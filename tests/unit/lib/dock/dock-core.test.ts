import { describe, expect, it } from "vitest";
import {
  applyUrlFocus,
  closeEverywhere,
  dockFloater,
  floatPanel,
  focusedPanelId,
  moveFloater,
  resizeFloater,
  resetWorkspace,
  saveWorkspaceAs,
  switchWorkspace,
  toggleCollapse,
  toggleFloaterMaximized,
  toggleFloaterMinimized,
  toggleMaximize,
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
    version: 1,
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

describe("floatPanel", () => {
  it("removes the panel from the tree and creates a floater", () => {
    const s = floatPanel(
      baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS)),
      "/brain",
      { x: 50, y: 60 },
    );
    // Split dissolves; only /tasks remains.
    expect(treeOf(s)).toEqual(page("p-tasks", "/tasks"));
    expect(s.floaters).toHaveLength(1);
    const f = s.floaters[0];
    expect(f.panelIds).toEqual(["/brain"]);
    expect(f.activePanel).toBe("/brain");
    expect(f.x).toBe(50);
    expect(f.y).toBe(60);
    expect(f.width).toBe(560);
    expect(f.height).toBe(420);
    expect(f.minimized).toBe(false);
    expect(f.maximized).toBe(false);
    expect(f.z).toBeGreaterThan(0);
  });

  it("floats a whole tabs group when the source has multiple pages", () => {
    const s = floatPanel(
      baseState(tabs("t-a", "/brain", ["/brain", "/tasks"])),
      "/brain",
      { x: 0, y: 0 },
    );
    expect(s.floaters[0].panelIds).toEqual(["/brain", "/tasks"]);
    // Nothing left in the tree -> placeholder.
    expect(treeOf(s).type).toBe("page");
  });

  it("assigns increasing z order across floats", () => {
    let s = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    s = floatPanel(s, "/brain", { x: 0, y: 0 });
    s = floatPanel(s, "/tasks", { x: 10, y: 10 });
    expect(s.floaters[0].z).toBeLessThan(s.floaters[1].z);
  });

  it("is a no-op for a panel that does not exist", () => {
    const s0 = baseState(BRAIN);
    const s = floatPanel(s0, "/nope", { x: 0, y: 0 });
    expect(s).toBe(s0);
  });

  it("clears a stale focusGroupId", () => {
    let s = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    s.focusGroupId = "p-brain";
    s = floatPanel(s, "/brain", { x: 0, y: 0 });
    // p-brain is gone from the tree; focusGroupId must not dangle.
    expect(treeOf(s)).toEqual(page("p-tasks", "/tasks"));
  });
});

describe("dockFloater", () => {
  function floated(): { s: ProjectDockState; fid: string } {
    let s = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    s = floatPanel(s, "/brain", { x: 0, y: 0 });
    return { s, fid: s.floaters[0].id };
  }

  it("docks back onto a page node as a tab group", () => {
    const { s: s0, fid } = floated();
    const s = dockFloater(s0, fid, "p-tasks", "tab");
    expect(s.floaters).toHaveLength(0);
    expect(treeOf(s)).toEqual(tabs("p-tasks", "/brain", ["/tasks", "/brain"]));
  });

  it("docks to the left of a target node", () => {
    const { s: s0, fid } = floated();
    const s = dockFloater(s0, fid, "p-tasks", "left");
    const tree = treeOf(s);
    expect(tree.type).toBe("split");
    if (tree.type !== "split") return;
    expect(tree.direction).toBe("horizontal");
    expect(s.floaters).toHaveLength(0);
  });

  it("keeps other floaters intact", () => {
    let s = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    s = floatPanel(s, "/brain", { x: 0, y: 0 });
    // Float /tasks too (removes it from the tree).
    s = floatPanel(s, "/tasks", { x: 10, y: 10 });
    expect(s.floaters).toHaveLength(2);
    // Dock only the first back onto the placeholder root as a tab.
    s = dockFloater(s, s.floaters[0].id, "root", "tab");
    expect(s.floaters).toHaveLength(1);
    expect(s.floaters[0].panelIds).toEqual(["/tasks"]);
  });
});

describe("floater ops", () => {
  function floated(): { s: ProjectDockState; fid: string } {
    let s = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    s = floatPanel(s, "/brain", { x: 0, y: 0 });
    return { s, fid: s.floaters[0].id };
  }

  it("moveFloater updates position", () => {
    const { s: s0, fid } = floated();
    const s = moveFloater(s0, fid, { x: 123, y: 77 });
    expect(s.floaters[0].x).toBe(123);
    expect(s.floaters[0].y).toBe(77);
  });

  it("resizeFloater updates size", () => {
    const { s: s0, fid } = floated();
    const s = resizeFloater(s0, fid, { w: 800, h: 600 });
    expect(s.floaters[0].width).toBe(800);
    expect(s.floaters[0].height).toBe(600);
  });

  it("toggleFloaterMinimized flips the flag", () => {
    const { s: s0, fid } = floated();
    const s = toggleFloaterMinimized(s0, fid);
    expect(s.floaters[0].minimized).toBe(true);
    expect(toggleFloaterMinimized(s, fid).floaters[0].minimized).toBe(false);
  });

  it("toggleFloaterMaximized flips the flag", () => {
    const { s: s0, fid } = floated();
    const s = toggleFloaterMaximized(s0, fid);
    expect(s.floaters[0].maximized).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// closeEverywhere / collapse / maximize
// ---------------------------------------------------------------------------

describe("closeEverywhere", () => {
  it("closes a tree panel and clears its maximize/collapse state", () => {
    const s0 = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    s0.maximizedPanelId = "/brain";
    s0.collapsedPanels = ["/brain"];
    const s = closeEverywhere(s0, "/brain");
    expect(treeOf(s)).toEqual(page("p-tasks", "/tasks"));
    expect(s.maximizedPanelId).toBeNull();
    expect(s.collapsedPanels).toEqual([]);
  });

  it("removes a panel from a floater and discards an emptied floater", () => {
    let s = baseState(BRAIN);
    s = floatPanel(s, "/brain", { x: 0, y: 0 });
    s = closeEverywhere(s, "/brain");
    expect(s.floaters).toHaveLength(0);
  });
});

describe("toggleCollapse / toggleMaximize", () => {
  it("toggleCollapse adds then removes the panel", () => {
    let s = baseState(BRAIN);
    s = toggleCollapse(s, "/brain");
    expect(s.collapsedPanels).toEqual(["/brain"]);
    s = toggleCollapse(s, "/brain");
    expect(s.collapsedPanels).toEqual([]);
  });

  it("toggleMaximize sets, switches, and clears", () => {
    let s = baseState(split("s1", "horizontal", 0.5, BRAIN, TASKS));
    s = toggleMaximize(s, "/brain");
    expect(s.maximizedPanelId).toBe("/brain");
    s = toggleMaximize(s, "/tasks");
    expect(s.maximizedPanelId).toBe("/tasks");
    s = toggleMaximize(s, "/tasks");
    expect(s.maximizedPanelId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

describe("workspaces", () => {
  it("switchWorkspace creates a missing workspace from the current one", () => {
    const s = switchWorkspace(baseState(BRAIN), "Debugging");
    expect(s.activeWorkspace).toBe("Debugging");
    expect(s.workspaces.Debugging.tree).toEqual(BRAIN);
    // The original workspace is untouched.
    expect(s.workspaces.Development.tree).toEqual(BRAIN);
  });

  it("switchWorkspace swaps to an existing workspace tree", () => {
    const s0 = baseState(BRAIN);
    s0.workspaces.Planning = { tree: TASKS, params: {} };
    const s = switchWorkspace(s0, "Planning");
    expect(treeOf(s)).toEqual(TASKS);
  });

  it("saveWorkspaceAs copies the active workspace and switches to it", () => {
    let s = baseState(BRAIN);
    s.workspaces.Development.params["/brain"] = "note=1";
    s = saveWorkspaceAs(s, "Custom");
    expect(s.activeWorkspace).toBe("Custom");
    expect(s.workspaces.Custom.tree).toEqual(BRAIN);
    expect(s.workspaces.Custom.params["/brain"]).toBe("note=1");
  });

  it("resetWorkspace replaces the active workspace tree and clears params", () => {
    const s = baseState(tabs("t-a", "/brain", ["/brain", "/tasks"]));
    s.workspaces.Development.params["/brain"] = "note=1";
    const preset = split("s-preset", "horizontal", 0.5, BRAIN, TASKS);
    const s2 = resetWorkspace(s, preset);
    expect(treeOf(s2)).toEqual(preset);
    expect(s2.workspaces.Development.params).toEqual({});
  });
});
