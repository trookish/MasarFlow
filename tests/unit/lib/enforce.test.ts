import { describe, it, expect } from "vitest";
import { runEnforcer, isValidPattern, compileStandardPattern } from "@/lib/enforce";
import { standardSchema, noteSchema, specSchema, taskSchema } from "@/lib/db/schema";

function standard(over: Record<string, unknown>) {
  return standardSchema.parse({
    id: over.id ?? "s1",
    projectId: "p1",
    title: "std",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });
}
function note(over: Record<string, unknown>) {
  return noteSchema.parse({
    id: over.id ?? "n1",
    projectId: "p1",
    title: "t",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });
}
function spec(over: Record<string, unknown>) {
  return specSchema.parse({
    id: "spec1",
    projectId: "p1",
    number: "RFC-001",
    title: "x",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });
}
function task(over: Record<string, unknown>) {
  return taskSchema.parse({
    id: "task1",
    projectId: "p1",
    title: "x",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });
}

describe("isValidPattern / compileStandardPattern", () => {
  it("treats empty patterns as valid but uncheckable", () => {
    expect(isValidPattern("")).toBe(true);
    expect(compileStandardPattern("")).toBeNull();
  });
  it("rejects malformed regexes", () => {
    expect(isValidPattern("(")).toBe(false);
    expect(compileStandardPattern("(")).toBeNull();
  });
});

describe("runEnforcer", () => {
  it("flags forbidden-pattern matches across notes (case-insensitive)", () => {
    const std = standard({ pattern: "\\bproto\\b", title: "No 'proto'" });
    const notes = [note({ id: "n1", title: "Pathfinding", body: "Proto compare" })];
    const v = runEnforcer([std], notes, [], []);
    expect(v).toHaveLength(1);
    expect(v[0].entityKind).toBe("note");
    expect(v[0].match.toLowerCase()).toBe("proto");
    expect(v[0].standardTitle).toBe("No 'proto'");
  });

  it("ignores standards that are not enforced or have no pattern", () => {
    const notEnforced = standard({ id: "a", pattern: "proto", enforced: false });
    const noPattern = standard({ id: "b", pattern: "" });
    const notes = [note({ body: "proto" })];
    expect(runEnforcer([notEnforced, noPattern], notes, [], [])).toEqual([]);
  });

  it("scans specs and tasks too", () => {
    const std = standard({ pattern: "TODO" });
    const specs = [spec({ purpose: "TODO write this" })];
    const tasks = [task({ description: "has a TODO here" })];
    const v = runEnforcer([std], [], specs, tasks);
    expect(v.map((x) => x.entityKind).sort()).toEqual(["spec", "task"]);
  });

  it("skips invalid regexes instead of throwing", () => {
    const std = standard({ pattern: "(" });
    expect(() => runEnforcer([std], [note({ body: "x" })], [], [])).not.toThrow();
    expect(runEnforcer([std], [note({ body: "x" })], [], [])).toEqual([]);
  });
});
