import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/db/schema";
import { bucketOf, dayKey, endOfDay, groupTasks, startOfDay } from "@/lib/today/model";

const DAY = 24 * 60 * 60 * 1000;
// 2026-10-16 12:00 local (the test machine is UTC+3, so local != UTC here).
const NOON = new Date(2026, 9, 16, 12, 0, 0).getTime();

/**
 * Exactly the real Task shape (src/lib/db/schema.ts taskSchema) — externalRef
 * was added by P6.T16; dueDate by P8.T17. No other fields exist.
 */
function task(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    projectId: "p1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "medium",
    specId: null,
    sprintId: null,
    parentTaskId: null,
    assignee: "human", // assigneeSchema enum: human | ai | architect | programmer | reviewer | tester | …
    dependencies: [],
    progress: 0,
    tags: [],
    externalRef: "",
    dueDate: null,
    createdAt: NOON,
    updatedAt: NOON,
    ...overrides,
  };
}

describe("dayKey / startOfDay / endOfDay", () => {
  it("formats in LOCAL time, not UTC", () => {
    expect(dayKey(NOON)).toBe("2026-10-16");
    expect(dayKey(new Date(2026, 9, 16, 1, 0, 0).getTime())).toBe("2026-10-16");
  });

  it("start/end bracket the local day", () => {
    expect(new Date(startOfDay(NOON)).getHours()).toBe(0);
    expect(dayKey(startOfDay(NOON) - 1)).toBe("2026-10-15");
    expect(dayKey(endOfDay(NOON))).toBe("2026-10-16");
    expect(endOfDay(NOON)).toBe(startOfDay(NOON) + DAY - 1);
  });
});

describe("bucketOf", () => {
  it("sorts by due date first, then by status, then by priority", () => {
    expect(bucketOf(task({ dueDate: NOON - DAY }), NOON)).toBe("overdue");
    expect(bucketOf(task({ dueDate: NOON }), NOON)).toBe("dueToday");
    expect(bucketOf(task({ status: "in_progress" }), NOON)).toBe("inProgress");
    expect(bucketOf(task({ status: "review" }), NOON)).toBe("inProgress");
    expect(bucketOf(task({ priority: "urgent" }), NOON)).toBe("upNext");
    expect(bucketOf(task({ priority: "high" }), NOON)).toBe("upNext");
  });

  it("drops finished work and unremarkable backlog", () => {
    expect(bucketOf(task({ status: "done" }), NOON)).toBeNull();
    expect(bucketOf(task({ status: "todo", priority: "low" }), NOON)).toBeNull();
    expect(bucketOf(task({ status: "backlog", priority: "medium" }), NOON)).toBeNull();
  });

  it("a task due tomorrow is not on today's list", () => {
    expect(bucketOf(task({ dueDate: NOON + DAY }), NOON)).toBeNull();
  });
});

describe("groupTasks", () => {
  const tasks = [
    task({ id: "a", title: "overdue", dueDate: NOON - DAY }),
    task({ id: "b", title: "due", dueDate: NOON }),
    task({ id: "c", title: "doing", status: "in_progress", updatedAt: NOON - 1000 }),
    task({ id: "d", title: "urgent", priority: "urgent" }),
    task({ id: "e", title: "done", status: "done" }),
  ];

  it("returns four ordered lists, newest work first inside each", () => {
    const grouped = groupTasks(tasks, NOON);
    expect(grouped.overdue.map((t) => t.title)).toEqual(["overdue"]);
    expect(grouped.dueToday.map((t) => t.title)).toEqual(["due"]);
    expect(grouped.inProgress.map((t) => t.title)).toEqual(["doing"]);
    expect(grouped.upNext.map((t) => t.title)).toEqual(["urgent"]);
  });

  it("counts every bucket so the UI can show totals", () => {
    expect(groupTasks(tasks, NOON).counts).toEqual({
      overdue: 1,
      dueToday: 1,
      inProgress: 1,
      upNext: 1,
    });
  });

  it("is deterministic for an empty project", () => {
    expect(groupTasks([], NOON).all).toEqual([]);
  });
});
