import { describe, it, expect } from "vitest";
import { readSelection, selectionFor, withSelection } from "@/lib/entities/url";
import { applyUrlFocus } from "@/lib/dock/dock-core";
import { defaultProjectState } from "@/lib/dock/presets";

describe("withSelection / readSelection", () => {
  it("sets the param and preserves others", () => {
    expect(withSelection("", "task", "t1")).toBe("task=t1");
    expect(withSelection("a=1&task=old", "task", "t2")).toBe("a=1&task=t2");
  });
  it("clearing writes an explicit empty value, never removes the key", () => {
    expect(withSelection("task=t1", "task", null)).toBe("task=");
  });
  it("reads empty as no selection", () => {
    expect(readSelection("task=t1", "task")).toBe("t1");
    expect(readSelection("task=", "task")).toBeNull();
    expect(readSelection("", "task")).toBeNull();
  });
});

describe("selectionFor (hidden panels keep their last selection — finding A6)", () => {
  it("uses the URL while the page is focused", () => {
    expect(selectionFor("/sprints", "/sprints", "sprint=s1", "sprint", "old")).toBe("s1");
    expect(selectionFor("/sprints", "/sprints", "sprint=", "sprint", "old")).toBeNull();
  });
  it("keeps the last value while another page is focused", () => {
    expect(selectionFor("/tasks", "/sprints", "task=t1", "sprint", "s1")).toBe("s1");
  });
});

describe("dock contract this relies on (finding A5)", () => {
  it("an explicit empty param overwrites a stored snapshot; a bare path does not", () => {
    let s = defaultProjectState();
    s = applyUrlFocus(s, "/sprints?sprint=s1");
    expect(s.workspaces[s.activeWorkspace].params["/sprints"]).toBe("sprint=s1");
    const bare = applyUrlFocus(s, "/sprints");
    expect(bare.workspaces[bare.activeWorkspace].params["/sprints"]).toBe("sprint=s1");
    const cleared = applyUrlFocus(s, "/sprints?sprint=");
    expect(cleared.workspaces[cleared.activeWorkspace].params["/sprints"]).toBe("sprint=");
  });
});
