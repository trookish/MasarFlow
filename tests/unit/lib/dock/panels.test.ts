import { describe, expect, it } from "vitest";
import type { ProjectDockState } from "@/lib/dock/types";
import { defaultProjectState } from "@/lib/dock/presets";
import { applyUrlFocus, floatPanel } from "@/lib/dock/dock-core";
import { panelsForPath, slotOf } from "@/lib/dock/panels";

function stateWith(paths: string[]): ProjectDockState {
  let s = defaultProjectState();
  for (const path of paths) s = applyUrlFocus(s, path);
  return s;
}

describe("panelsForPath", () => {
  it("finds the single panel for a path and where it lives", () => {
    const s = stateWith(["/dashboard", "/tasks"]);
    const found = panelsForPath(s, "/tasks");
    expect(found).toHaveLength(1);
    expect(found[0].panelId).toBe("/tasks");
    expect(found[0].slot.kind).toBe("tree");
  });

  it("uses the path, not the query snapshot", () => {
    const s = applyUrlFocus(defaultProjectState(), "/brain?note=abc");
    expect(panelsForPath(s, "/brain").map((p) => p.panelId)).toEqual(["/brain"]);
  });

  it("sees panels that live in floaters", () => {
    const s = floatPanel(stateWith(["/dashboard", "/chat"]), "/chat", { x: 10, y: 10 });
    const found = panelsForPath(s, "/chat");
    expect(found).toHaveLength(1);
    expect(found[0].slot.kind).toBe("floater");
  });

  it("returns nothing for a path that is not open", () => {
    expect(panelsForPath(defaultProjectState(), "/devlogs")).toEqual([]);
  });
});

describe("one panel per path (the invariant)", () => {
  it("re-opening an already open path never duplicates it", () => {
    let s = stateWith(["/tasks"]);
    for (const url of ["/tasks", "/tasks?task=a", "/tasks?task=b", "/tasks"]) {
      s = applyUrlFocus(s, url);
      expect(panelsForPath(s, "/tasks")).toHaveLength(1);
    }
  });

  it("slotOf resolves tree, floater and collapsed panels", () => {
    const s = stateWith(["/tasks"]);
    expect(slotOf(s, "/tasks")).toEqual({ kind: "tree", ownerId: expect.any(String) });
    expect(slotOf(s, "/nope")).toBeNull();
  });
});
