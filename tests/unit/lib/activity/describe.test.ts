import { describe, it, expect } from "vitest";
import { describeChange, makeThrottle } from "@/lib/activity/describe";

describe("describeChange", () => {
  it("describes a created task", () => {
    expect(
      describeChange("tasks", "created", { id: "t1", projectId: "p1", title: "Fix login" }),
    ).toEqual({
      projectId: "p1",
      entityKind: "task",
      entityId: "t1",
      op: "created",
      summary: 'Created task "Fix login"',
    });
  });
  it("includes the new status when a task moves", () => {
    const d = describeChange(
      "tasks",
      "updated",
      { id: "t1", projectId: "p1", title: "Fix login" },
      { status: "done" },
    );
    expect(d?.summary).toBe('Updated task "Fix login" → done');
  });
  it("uses the right title field per table", () => {
    expect(describeChange("sprints", "deleted", { id: "s", projectId: "p", name: "Sprint 4" })?.summary).toBe(
      'Deleted sprint "Sprint 4"',
    );
    expect(describeChange("commits", "created", { id: "c", projectId: "p", message: "fix: x\n\nbody" })?.summary).toBe(
      'Created commit "fix: x"',
    );
  });
  it("ignores untracked tables and rows without a project", () => {
    expect(describeChange("canvasNodes", "created", { id: "n", projectId: "p" })).toBeNull();
    expect(describeChange("tasks", "created", { id: "t", title: "x" })).toBeNull();
  });
});

describe("makeThrottle", () => {
  it("lets the first update through, then drops repeats inside the window", () => {
    let now = 1000;
    const allow = makeThrottle(60_000, () => now);
    expect(allow("note:n1:updated")).toBe(true);
    now += 10_000;
    expect(allow("note:n1:updated")).toBe(false);
    expect(allow("note:n2:updated")).toBe(true);
    now += 60_000;
    expect(allow("note:n1:updated")).toBe(true);
  });
});
