import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { specsRepo } from "@/lib/db/repos/specs";
import { tasksRepo } from "@/lib/db/repos/tasks";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("specsRepo.recomputeProgress", () => {
  it("is 0 when a spec has no linked tasks", async () => {
    const spec = await specsRepo.create({
      projectId: "p1",
      number: "RFC-001",
      title: "Empty",
    });
    await specsRepo.recomputeProgress(spec.id);
    expect((await specsRepo.get(spec.id))?.implementationProgress).toBe(0);
  });

  it("is the percentage of linked tasks in the done status", async () => {
    const spec = await specsRepo.create({
      projectId: "p1",
      number: "RFC-002",
      title: "Loop",
    });
    await tasksRepo.create({ projectId: "p1", title: "a", specId: spec.id, status: "done" });
    await tasksRepo.create({ projectId: "p1", title: "b", specId: spec.id, status: "todo" });
    await tasksRepo.create({ projectId: "p1", title: "c", specId: spec.id, status: "review" });
    await tasksRepo.create({ projectId: "p1", title: "d", specId: spec.id, status: "done" });

    await specsRepo.recomputeProgress(spec.id);
    // 2 of 4 done -> 50%
    expect((await specsRepo.get(spec.id))?.implementationProgress).toBe(50);
  });

  it("only counts tasks linked to that spec", async () => {
    const spec = await specsRepo.create({
      projectId: "p1",
      number: "RFC-003",
      title: "Scoped",
    });
    await tasksRepo.create({ projectId: "p1", title: "mine", specId: spec.id, status: "done" });
    await tasksRepo.create({ projectId: "p1", title: "other", specId: null, status: "todo" });

    await specsRepo.recomputeProgress(spec.id);
    expect((await specsRepo.get(spec.id))?.implementationProgress).toBe(100);
  });
});
