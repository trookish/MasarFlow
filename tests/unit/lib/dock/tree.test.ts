import { describe, expect, it } from "vitest";
import {
  closePanel,
  collectPages,
  findNode,
  focusPanel,
  isFocusedIn,
  movePanel,
  normalizeTree,
  openPanel,
  reorderTab,
  resizeSplit,
} from "@/lib/dock/tree";
import type { DockNode } from "@/lib/dock/types";

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
const BRAIN_TASKS_TABS = tabs("t-a", "/brain", ["/brain", "/tasks"]);

// ---------------------------------------------------------------------------
// findNode / collectPages / isFocusedIn
// ---------------------------------------------------------------------------

describe("findNode", () => {
  it("finds a node by id at the root", () => {
    expect(findNode(BRAIN, "p-brain")).toEqual(BRAIN);
  });

  it("finds a node deep in the tree", () => {
    const tree = split("s1", "horizontal", 0.5, BRAIN_TASKS_TABS, TASKS);
    expect(findNode(tree, "t-a")).toEqual(BRAIN_TASKS_TABS);
    expect(findNode(tree, "p-tasks")).toEqual(TASKS);
  });

  it("returns null for unknown ids", () => {
    expect(findNode(BRAIN, "nope")).toBeNull();
  });
});

describe("collectPages", () => {
  it("collects pageIds from page, tabs, and nested splits", () => {
    const tree = split(
      "s1",
      "horizontal",
      0.5,
      BRAIN_TASKS_TABS,
      page("p-canvas", "/canvas"),
    );
    expect(collectPages(tree)).toEqual(["/brain", "/tasks", "/canvas"]);
  });
});

describe("isFocusedIn", () => {
  it("is true when panelId is the active page of the tabs node", () => {
    expect(isFocusedIn(BRAIN_TASKS_TABS, "t-a", "/brain")).toBe(true);
    expect(isFocusedIn(BRAIN_TASKS_TABS, "t-a", "/tasks")).toBe(false);
  });

  it("is true when panelId is the pageId of the page node", () => {
    expect(isFocusedIn(BRAIN, "p-brain", "/brain")).toBe(true);
  });

  it("is false for unrelated nodes or panels", () => {
    expect(isFocusedIn(BRAIN, "p-brain", "/tasks")).toBe(false);
    expect(isFocusedIn(TASKS, "p-brain", "/tasks")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// openPanel
// ---------------------------------------------------------------------------

describe("openPanel", () => {
  it("wraps an empty-root page in a tabs node with the new page active", () => {
    const { tree, focusGroupId } = openPanel(BRAIN, "/tasks", null);
    expect(tree.type).toBe("tabs");
    if (tree.type !== "tabs") return;
    expect(tree.pages).toEqual(["/brain", "/tasks"]);
    expect(tree.activePage).toBe("/tasks");
    expect(focusGroupId).toBe(tree.id);
  });

  it("focuses an existing panel without duplicating it", () => {
    const { tree, focusGroupId } = openPanel(
      BRAIN_TASKS_TABS,
      "/brain",
      null,
    );
    expect(tree).toEqual(tabs("t-a", "/brain", ["/brain", "/tasks"]));
    expect(focusGroupId).toBe("t-a");
  });

  it("appends + activates into the focus-group tabs node", () => {
    const other = split(
      "s1",
      "horizontal",
      0.5,
      tabs("t-a", "/brain", ["/brain"]),
      TASKS,
    );
    const { tree, focusGroupId } = openPanel(other, "/canvas", "t-a");
    expect(tree.type).toBe("split");
    if (tree.type !== "split") return;
    const group = tree.children[0];
    expect(group).toEqual(tabs("t-a", "/canvas", ["/brain", "/canvas"]));
    expect(focusGroupId).toBe("t-a");
  });

  it("replaces a bare root page with tabs [old, new] when no focus group", () => {
    const { tree, focusGroupId } = openPanel(BRAIN, "/tasks", null);
    if (tree.type !== "tabs") return;
    expect(tree.pages).toEqual(["/brain", "/tasks"]);
    expect(focusGroupId).toBe(tree.id);
  });

  it("splits the root when root is a split and focus group is missing", () => {
    const root = split(
      "s-root",
      "horizontal",
      0.7,
      BRAIN,
      tabs("t-b", "/tasks", ["/tasks"]),
    );
    const { tree, focusGroupId } = openPanel(root, "/canvas", "gone-node");
    expect(tree.type).toBe("split");
    if (tree.type !== "split") return;
    // Old root preserved as first child, new page as second.
    expect(tree.children[0]).toEqual(root);
    expect(tree.children[1]).toEqual({
      type: "page",
      id: expect.any(String),
      pageId: "/canvas",
    });
    expect(tree.ratio).toBe(0.5);
    expect(collectPages(tree)).toEqual(["/brain", "/tasks", "/canvas"]);
    expect(focusGroupId).toBe(tree.children[1].id);
  });
});

// ---------------------------------------------------------------------------
// focusPanel / closePanel
// ---------------------------------------------------------------------------

describe("focusPanel", () => {
  it("sets activePage deep in the tree without mutating input", () => {
    const root = split(
      "s1",
      "horizontal",
      0.5,
      BRAIN_TASKS_TABS,
      page("p-canvas", "/canvas"),
    );
    const before = structuredClone(root);
    const focused = focusPanel(root, "/tasks");
    expect(root).toEqual(before); // input untouched
    const group = findNode(focused, "t-a");
    expect(group).toEqual(tabs("t-a", "/tasks", ["/brain", "/tasks"]));
  });
});

describe("closePanel", () => {
  it("activates the previous neighbor when closing the active tab", () => {
    const closed = closePanel(
      tabs("t-a", "/tasks", ["/brain", "/tasks", "/specs"]),
      "/tasks",
    );
    expect(closed).toEqual(tabs("t-a", "/brain", ["/brain", "/specs"]));
  });

  it("activates the next neighbor when closing the first tab", () => {
    const closed = closePanel(
      tabs("t-a", "/brain", ["/brain", "/tasks", "/specs"]),
      "/brain",
    );
    expect(closed).toEqual(tabs("t-a", "/tasks", ["/tasks", "/specs"]));
  });

  it("keeps the active page when closing a non-active tab", () => {
    const closed = closePanel(
      tabs("t-a", "/brain", ["/brain", "/tasks", "/specs"]),
      "/specs",
    );
    expect(closed).toEqual(tabs("t-a", "/brain", ["/brain", "/tasks"]));
  });

  it("folds a single-page tabs node to a page keeping the id", () => {
    const closed = closePanel(
      tabs("t-a", "/brain", ["/brain", "/tasks"]),
      "/tasks",
    );
    expect(closed).toEqual({ type: "page", id: "t-a", pageId: "/brain" });
  });

  it("removes a bare page node -> placeholder page", () => {
    const closed = closePanel(BRAIN, "/brain");
    expect(closed.type).toBe("page");
    if (closed.type !== "page") return;
    expect(closed.pageId).toBe("/dashboard");
  });
});

// ---------------------------------------------------------------------------
// movePanel
// ---------------------------------------------------------------------------

describe("movePanel", () => {
  it("tab-merge: moving a bare page onto a tabs node appends + activates", () => {
    const tree = split("s1", "horizontal", 0.5, BRAIN, BRAIN_TASKS_TABS);
    const moved = movePanel(tree, "/brain", "t-a", "tab");
    const group = findNode(moved, "t-a");
    expect(group).toEqual(tabs("t-a", "/brain", ["/tasks", "/brain"]));
  });

  it("tab-merge onto root wraps: root becomes tabs of all reachable pages", () => {
    const tree = split("s1", "horizontal", 0.5, BRAIN, TASKS);
    const moved = movePanel(tree, "/brain", "root", "tab");
    expect(moved.type).toBe("tabs");
    if (moved.type !== "tabs") return;
    expect(moved.pages).toEqual(["/tasks", "/brain"]);
    expect(moved.activePage).toBe("/brain");
  });

  it("left: splits the target with source on the left", () => {
    const tree = split("s1", "horizontal", 0.5, BRAIN, BRAIN_TASKS_TABS);
    const moved = movePanel(tree, "/brain", "t-a", "left");
    expect(moved.type).toBe("split");
    if (moved.type !== "split") return;
    expect(moved.direction).toBe("horizontal");
    expect(moved.ratio).toBe(0.5);
    const [left, right] = moved.children;
    expect(left).toEqual({ type: "page", id: "p-brain", pageId: "/brain" });
    // The source panel was removed from t-a, leaving one page -> folded.
    expect(right).toEqual({ type: "page", id: "t-a", pageId: "/tasks" });
  });

  it("right: source lands on the right of the target", () => {
    const tree = split(
      "s1",
      "horizontal",
      0.5,
      BRAIN,
      tabs("t-a", "/tasks", ["/tasks", "/canvas"]),
    );
    const moved = movePanel(tree, "/brain", "t-a", "right");
    expect(moved.type).toBe("split");
    if (moved.type !== "split") return;
    expect(moved.children[0]).toEqual(
      tabs("t-a", "/tasks", ["/tasks", "/canvas"]),
    );
    expect(moved.children[1]).toEqual({
      type: "page",
      id: "p-brain",
      pageId: "/brain",
    });
  });

  it("top/bottom use vertical direction with correct ordering", () => {
    const tree = split("s1", "horizontal", 0.5, BRAIN, TASKS);
    const movedTop = movePanel(tree, "/brain", "p-tasks", "top");
    if (movedTop.type !== "split") return expect.unreachable();
    expect(movedTop.direction).toBe("vertical");
    expect(movedTop.children[0]).toEqual({
      type: "page",
      id: "p-brain",
      pageId: "/brain",
    });

    const movedBottom = movePanel(tree, "/brain", "p-tasks", "bottom");
    if (movedBottom.type !== "split") return expect.unreachable();
    expect(movedBottom.direction).toBe("vertical");
    expect(movedBottom.children[1]).toEqual({
      type: "page",
      id: "p-brain",
      pageId: "/brain",
    });
  });

  it("group drag keeps whole group pages on a real target", () => {
    const tree = split(
      "s1",
      "horizontal",
      0.5,
      tabs("t-src", "/brain", ["/brain", "/settings"]),
      tabs("t-dst", "/tasks", ["/tasks"]),
    );
    const moved = movePanel(tree, "/brain", "t-dst", "left");
    if (moved.type !== "split") return expect.unreachable();
    expect(moved.children[0]).toEqual(
      tabs("t-src", "/brain", ["/brain", "/settings"]),
    );
    // t-dst holds a single page -> folded by normalize, keeping its id.
    expect(moved.children[1]).toEqual({
      type: "page",
      id: "t-dst",
      pageId: "/tasks",
    });
  });

  it("stale target falls back to a root insert (no page loss)", () => {
    const tree = split(
      "s1",
      "horizontal",
      0.5,
      tabs("t-src", "/brain", ["/brain", "/settings"]),
      TASKS,
    );
    const moved = movePanel(tree, "/brain", "gone-node", "left");
    expect(collectPages(moved).sort()).toEqual(
      ["/brain", "/settings", "/tasks"].sort(),
    );
  });

  it("root split-wrap puts the source left of the old root", () => {
    const tree = split(
      "s1",
      "horizontal",
      0.5,
      BRAIN,
      tabs("t-root", "/tasks", ["/tasks"]),
    );
    const moved = movePanel(tree, "/brain", "root", "left");
    expect(moved.type).toBe("split");
    if (moved.type !== "split") return;
    expect(moved.children[0]).toEqual({
      type: "page",
      id: "p-brain",
      pageId: "/brain",
    });
    expect(moved.children[1]).toEqual({
      type: "page",
      id: "t-root",
      pageId: "/tasks",
    });
  });

  it("moving a panel to its own tabs node with zone tab is a no-op re-activation", () => {
    const tree = BRAIN_TASKS_TABS;
    const moved = movePanel(tree, "/brain", "t-a", "tab");
    expect(moved).toEqual(tabs("t-a", "/brain", ["/brain", "/tasks"]));
  });

  it("moving a group into its own former sibling does not duplicate pages", () => {
    const tree = split(
      "s1",
      "horizontal",
      0.5,
      tabs("t-src", "/brain", ["/brain", "/tasks"]),
      page("p-canvas", "/canvas"),
    );
    const moved = movePanel(tree, "/brain", "p-canvas", "tab");
    // Whole group moves onto the page target -> tabs [/canvas, /brain, /tasks]
    expect(moved.type).toBe("tabs");
    if (moved.type !== "tabs") return;
    expect(moved.pages).toEqual(["/canvas", "/brain", "/tasks"]);
    expect(moved.activePage).toBe("/brain");
  });
});

// ---------------------------------------------------------------------------
// resizeSplit / reorderTab / normalizeTree
// ---------------------------------------------------------------------------

describe("resizeSplit", () => {
  it("sets the ratio on the targeted split", () => {
    const tree = split("s1", "horizontal", 0.5, BRAIN, TASKS);
    const resized = resizeSplit(tree, "s1", 0.7);
    expect(resized).toEqual(split("s1", "horizontal", 0.7, BRAIN, TASKS));
  });

  it("clamps out-of-range ratios", () => {
    const tree = split("s1", "horizontal", 0.5, BRAIN, TASKS);
    expect(resizeSplit(tree, "s1", 1.2)).toEqual(
      split("s1", "horizontal", 0.95, BRAIN, TASKS),
    );
    expect(resizeSplit(tree, "s1", 0.01)).toEqual(
      split("s1", "horizontal", 0.05, BRAIN, TASKS),
    );
  });

  it("only affects the matching split", () => {
    const inner = split("s-inner", "horizontal", 0.5, BRAIN, TASKS);
    const tree = split("s-outer", "vertical", 0.5, inner, page("p-c", "/c"));
    const resized = resizeSplit(tree, "s-inner", 0.9);
    expect(findNode(resized, "s-inner")).toEqual(
      split("s-inner", "horizontal", 0.9, BRAIN, TASKS),
    );
    expect(findNode(resized, "s-outer")).toMatchObject({ ratio: 0.5 });
  });
});

describe("reorderTab", () => {
  it("moves a panel to the requested index and activates it", () => {
    const moved = reorderTab(BRAIN_TASKS_TABS, "t-a", "/tasks", 0);
    expect(moved).toEqual(tabs("t-a", "/tasks", ["/tasks", "/brain"]));
  });

  it("clamps an out-of-range index to the end", () => {
    const clamped = reorderTab(BRAIN_TASKS_TABS, "t-a", "/brain", 99);
    if (clamped.type !== "tabs") return expect.unreachable();
    expect(clamped.pages).toEqual(["/tasks", "/brain"]);
  });
});

describe("normalizeTree", () => {
  it("folds a single-page tabs node into a page, keeping the tabs id", () => {
    const normalized = normalizeTree(tabs("t-a", "/brain", ["/brain"]));
    expect(normalized).toEqual({ type: "page", id: "t-a", pageId: "/brain" });
  });

  it("keeps a valid binary split unchanged", () => {
    const tree = split("s1", "horizontal", 0.5, BRAIN, page("gone", "/x"));
    expect(normalizeTree(tree)).toEqual(tree);
  });

  it("replaces a 0-child split with a placeholder page", () => {
    const degenerate: DockNode = {
      type: "split",
      id: "s0",
      direction: "horizontal",
      ratio: 0.5,
      children: [],
    };
    const normalized = normalizeTree(degenerate);
    expect(normalized.type).toBe("page");
    if (normalized.type !== "page") return;
    expect(normalized.pageId).toBe("/dashboard");
  });
});
