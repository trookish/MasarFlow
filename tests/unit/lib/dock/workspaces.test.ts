import { describe, expect, it } from "vitest";
import { defaultProjectState } from "@/lib/dock/presets";
import {
  applyLayout,
  deleteWorkspace,
  exportLayout,
  importLayout,
} from "@/lib/dock/dock-core";

describe("deleteWorkspace", () => {
  it("refuses to delete the last workspace", () => {
    const s = defaultProjectState();
    const only = { ...s, workspaces: { Development: s.workspaces.Development } };
    expect(deleteWorkspace(only, "Development")).toBe(only);
  });

  it("deletes a background workspace and keeps the active one", () => {
    const s = defaultProjectState();
    const next = deleteWorkspace(s, "Planning");
    expect(Object.keys(next.workspaces)).toEqual(["Development", "Debugging", "AI Research"]);
    expect(next.activeWorkspace).toBe("Development");
  });

  it("switches to a survivor when the active workspace is deleted", () => {
    const next = deleteWorkspace(defaultProjectState(), "Development");
    expect(next.activeWorkspace).toBe("Planning");
    expect(next.workspaces.Development).toBeUndefined();
  });

  it("ignores an unknown name", () => {
    const s = defaultProjectState();
    expect(deleteWorkspace(s, "Nope")).toBe(s);
  });
});

describe("export / import layout", () => {
  it("round-trips the active workspace", () => {
    const s = defaultProjectState();
    const layout = importLayout(exportLayout(s));
    expect(layout).not.toBeNull();
    expect(layout!.name).toBe("Development");
    expect(layout!.tree).toEqual(s.workspaces.Development.tree);
  });

  it("rejects junk", () => {
    expect(importLayout("{")).toBeNull();
    expect(importLayout("null")).toBeNull();
    expect(importLayout(JSON.stringify({ tree: { type: "bogus" } }))).toBeNull();
    expect(importLayout(JSON.stringify({ tree: null }))).toBeNull();
  });

  it("canonicalizes params and defaults a missing name", () => {
    const layout = importLayout(
      JSON.stringify({
        tree: { type: "page", id: "p1", pageId: "/tasks" },
        params: { "/tasks": "?task=t1" },
      }),
    )!;
    expect(layout.name).toBe("Imported");
    expect(layout.params).toEqual({ "/tasks": "task=t1" });
  });

  it("applyLayout picks a free name and activates it", () => {
    const s = defaultProjectState();
    const layout = importLayout(exportLayout(s))!;
    const next = applyLayout(s, layout);
    expect(Object.keys(next.workspaces)).toContain("Development 2");
    expect(next.activeWorkspace).toBe("Development 2");
    expect(next.workspaces["Development 2"].tree).not.toBe(s.workspaces.Development.tree);
  });
});
