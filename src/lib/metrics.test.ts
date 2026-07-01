import { describe, it, expect } from "vitest";
import { computeHealth, computeArchScore, computeTechDebt } from "./metrics";
import type { Task, Spec, System, Standard, Note } from "./db/schema";

const ts = { createdAt: 0, updatedAt: 0 };

function task(patch: Partial<Task>): Task {
  return {
    id: Math.random().toString(36),
    projectId: "p",
    title: "t",
    description: "",
    status: "todo",
    priority: "medium",
    specId: null,
    sprintId: null,
    parentTaskId: null,
    assignee: "human",
    dependencies: [],
    progress: 0,
    tags: [],
    ...ts,
    ...patch,
  };
}

function spec(progress: number): Spec {
  return {
    id: Math.random().toString(36),
    projectId: "p",
    number: "RFC-001",
    title: "s",
    status: "draft",
    purpose: "",
    goals: [],
    features: [],
    constraints: [],
    dependencies: [],
    acceptance: [],
    risks: [],
    futureImprovements: [],
    technicalNotes: "",
    implementationProgress: progress,
    linkedNoteIds: [],
    linkedTaskIds: [],
    ...ts,
  };
}

function system(patch: Partial<System>): System {
  return {
    id: Math.random().toString(36),
    projectId: "p",
    name: "sys",
    description: "",
    category: "module",
    status: "active",
    health: 100,
    dependencies: [],
    ...ts,
    ...patch,
  };
}

describe("computeHealth", () => {
  it("is null with no tasks and no specs", () => {
    expect(computeHealth([], [])).toBeNull();
  });

  it("is 100 when everything is done", () => {
    expect(
      computeHealth([task({ status: "done" })], [spec(100)]),
    ).toBe(100);
  });

  it("blends task completion (60%) and spec progress (40%)", () => {
    const tasks = [task({ status: "done" }), task({ status: "todo" })];
    expect(computeHealth(tasks, [spec(50)])).toBe(50); // 0.6*50 + 0.4*50
  });

  it("penalizes open urgent tasks", () => {
    const tasks = [
      task({ status: "done" }),
      task({ status: "todo", priority: "urgent" }),
    ];
    // 50% done → 30 base from tasks only; urgent −5 ⇒ 45... tasks only: 0.5*100=50, −5 = 45
    expect(computeHealth(tasks, [])).toBe(45);
  });
});

describe("computeArchScore", () => {
  it("is null with no systems", () => {
    expect(computeArchScore([])).toBeNull();
  });

  it("averages system health", () => {
    expect(
      computeArchScore([system({ health: 100 }), system({ health: 60 })]),
    ).toBe(80);
  });

  it("penalizes depending on deprecated systems", () => {
    const dep = system({ status: "deprecated", health: 100 });
    const consumer = system({ health: 100, dependencies: [dep.id] });
    expect(computeArchScore([dep, consumer])).toBe(90);
  });
});

describe("computeTechDebt", () => {
  const note = (body: string): Note => ({
    id: Math.random().toString(36),
    projectId: "p",
    type: "note",
    title: "n",
    body,
    excerpt: "",
    tags: [],
    folderId: null,
    ...ts,
  });
  const standard = (pattern: string): Standard => ({
    id: "std",
    projectId: "p",
    category: "naming",
    title: "no TODO",
    rule: "",
    examples: [],
    enforced: true,
    pattern,
    ...ts,
  });

  it("is null with no content", () => {
    expect(computeTechDebt([], [], [], [])).toBeNull();
  });

  it("is 0 for clean content and calm backlog", () => {
    expect(computeTechDebt([standard("TODO")], [note("all clean")], [], [])).toBe(0);
  });

  it("rises with violations", () => {
    const debt = computeTechDebt(
      [standard("TODO")],
      [note("TODO fix this")],
      [],
      [],
    );
    expect(debt).toBeGreaterThan(0);
  });

  it("rises with pressing open tasks", () => {
    const debt = computeTechDebt(
      [],
      [],
      [],
      [task({ priority: "urgent" }), task({ priority: "low" })],
    );
    expect(debt).toBe(15); // 1/2 open pressing × 30
  });
});
