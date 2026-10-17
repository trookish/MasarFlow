import { describe, expect, it } from "vitest";
import type { DockNode } from "@/lib/dock/types";
import type { Rect } from "@/lib/dock/geometry";
import { focusTargetOf, layoutRects, neighborInDirection } from "@/lib/dock/nav-geo";

const page = (id: string, pageId: string): DockNode => ({ type: "page", id, pageId });
const tabs = (id: string, pages: string[]): DockNode => ({
  type: "tabs",
  id,
  activePage: pages[0],
  pages,
});
const split = (
  id: string,
  direction: "horizontal" | "vertical",
  a: DockNode,
  b: DockNode,
  ratio = 0.5,
): DockNode => ({ type: "split", id, direction, ratio, children: [a, b] });

const WORKSPACE: Rect = { x: 0, y: 0, width: 1000, height: 800 };

const twoUp = () => split("s1", "horizontal", page("left", "/tasks"), page("right", "/chat"));

describe("layoutRects", () => {
  it("splits the workspace rect by ratio for the leaves only", () => {
    const rects = layoutRects(twoUp(), WORKSPACE);
    expect(rects.get("left")).toEqual({ x: 0, y: 0, width: 500, height: 800 });
    expect(rects.get("right")).toEqual({ x: 500, y: 0, width: 500, height: 800 });
    expect(rects.has("s1")).toBe(false);
  });

  it("nests: a 25% first pane inside a 50% column", () => {
    const tree = split(
      "s1",
      "horizontal",
      split("s2", "vertical", page("a", "/a"), page("b", "/b"), 0.5),
      page("c", "/c"),
    );
    const rects = layoutRects(tree, WORKSPACE);
    expect(rects.get("a")).toEqual({ x: 0, y: 0, width: 500, height: 400 });
    expect(rects.get("b")).toEqual({ x: 0, y: 400, width: 500, height: 400 });
    expect(rects.get("c")).toEqual({ x: 500, y: 0, width: 500, height: 800 });
  });

  it("offsets from the workspace origin", () => {
    const rects = layoutRects(twoUp(), { x: 100, y: 40, width: 1000, height: 800 });
    expect(rects.get("right")?.x).toBe(600);
    expect(rects.get("left")?.y).toBe(40);
  });
});

describe("neighborInDirection", () => {
  const rects = layoutRects(twoUp(), WORKSPACE);

  it("moves between side-by-side groups", () => {
    expect(neighborInDirection(rects, "left", "right")).toBe("right");
    expect(neighborInDirection(rects, "right", "left")).toBe("left");
  });

  it("does not jump diagonally", () => {
    expect(neighborInDirection(rects, "left", "up")).toBeNull();
    expect(neighborInDirection(rects, "right", "down")).toBeNull();
  });

  it("prefers the nearest candidate, then the best aligned one", () => {
    const tree = split(
      "s1",
      "horizontal",
      page("src", "/a"),
      split("s2", "vertical", page("near", "/b"), page("far", "/c")),
    );
    const r = layoutRects(tree, WORKSPACE);
    expect(neighborInDirection(r, "src", "right")).toBe("near");
  });

  it("returns null for an unknown source or a dead end", () => {
    expect(neighborInDirection(rects, "nope", "left")).toBeNull();
    expect(neighborInDirection(new Map([["only", WORKSPACE]]), "only", "left")).toBeNull();
  });
});

describe("focusTargetOf", () => {
  it("focused panel of a group / page node", () => {
    expect(focusTargetOf(tabs("t", ["/x", "/y"]), "t")).toBe("/x");
    expect(focusTargetOf(page("p", "/z"), "p")).toBe("/z");
    expect(focusTargetOf(twoUp(), "s1")).toBeNull();
    expect(focusTargetOf(twoUp(), "gone")).toBeNull();
  });
});
