import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { tasksRepo } from "@/lib/db/repos/tasks";
import { specsRepo } from "@/lib/db/repos/specs";
import {
  assigneeLabel,
  deriveProgress,
  specProgress,
  STATUS_PROGRESS,
} from "@/lib/domain/task-model";
import { parseDayKey, dayKey } from "@/lib/today/model";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("task model (pure)", () => {
  it("leaf progress follows status, parents average subtasks", () => {
    expect(deriveProgress("done")).toBe(100);
    expect(deriveProgress("todo")).toBe(0);
    expect(
      deriveProgress("in_progress", [
        { progress: 100 },
        { progress: 0 },
        { progress: 50 },
      ]),
    ).toBe(50);
    expect(STATUS_PROGRESS.review).toBeGreaterThan(STATUS_PROGRESS.in_progress);
  });

  it("spec progress is the share of done tasks", () => {
    expect(specProgress([])).toBe(0);
    expect(
      specProgress([
        { status: "done" },
        { status: "todo" },
        { status: "done" },
        { status: "review" },
      ]),
    ).toBe(50);
  });

  it("legacy agent roles read as AI", () => {
    expect(assigneeLabel("human")).toBe("Me");
    expect(assigneeLabel("ai")).toBe("AI");
    expect(assigneeLabel("programmer" as never)).toBe("AI");
  });

  it("date input values round-trip on the local day", () => {
    const day = parseDayKey("2026-10-26")!;
    expect(dayKey(day)).toBe("2026-10-26");
    expect(parseDayKey("")).toBeNull();
  });
});

describe("task model (stored)", () => {
  it("status changes move progress, the spec and the parent in one command", async () => {
    const spec = await specsRepo.create({
      projectId: "p",
      title: "Spec",
      number: "SPEC-1",
    } as never);
    const parent = await tasksRepo.create({
      projectId: "p",
      title: "Parent",
      specId: spec.id,
      status: "todo",
    } as never);
    const a = await tasksRepo.create({
      projectId: "p",
      title: "A",
      specId: spec.id,
      parentTaskId: parent.id,
      status: "todo",
    } as never);
    await tasksRepo.create({
      projectId: "p",
      title: "B",
      specId: spec.id,
      parentTaskId: parent.id,
      status: "todo",
    } as never);

    await tasksRepo.update(a.id, { status: "done", progress: 7 });

    expect((await db.tasks.get(a.id))!.progress).toBe(100); // hand-set 7 is ignored
    expect((await db.tasks.get(parent.id))!.progress).toBe(50);
    expect((await db.specs.get(spec.id))!.implementationProgress).toBe(33);
    const events = (await db.events.toArray()).filter(
      (e) => e.entityId === a.id,
    );
    expect(events.map((e) => e.op)).toContain("update");
  });

  it("moving a task to another spec refreshes both specs", async () => {
    const s1 = await specsRepo.create({
      projectId: "p",
      title: "One",
      number: "SPEC-1",
    } as never);
    const s2 = await specsRepo.create({
      projectId: "p",
      title: "Two",
      number: "SPEC-2",
    } as never);
    const t = await tasksRepo.create({
      projectId: "p",
      title: "T",
      specId: s1.id,
      status: "done",
    } as never);
    expect((await db.specs.get(s1.id))!.implementationProgress).toBe(100);
    await tasksRepo.update(t.id, { specId: s2.id });
    expect((await db.specs.get(s1.id))!.implementationProgress).toBe(0);
    expect((await db.specs.get(s2.id))!.implementationProgress).toBe(100);
  });
});
