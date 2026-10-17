import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { seedDemoProject } from "@/lib/db/demo-seed";
import { workflowRepo } from "@/lib/db/repos";
import { WORKFLOW_STEPS } from "@/lib/ai/workflow";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

/**
 * The seed marks a run's first pipeline steps done by step KEY. A key that is
 * not a real pipeline step (e.g. "spec" instead of "requirements") matches
 * nothing, so the run shows a gap: a pending step sits before the running
 * one and the progress reads wrong.
 */
describe("demo seed workflow runs", () => {
  it("only uses real pipeline step keys, so done steps form an unbroken prefix", async () => {
    await seedDemoProject();
    const validKeys = new Set(WORKFLOW_STEPS.map((s) => s.key));
    const runs = await db.workflowRuns.toArray();
    expect(runs.length).toBe(3);

    for (const run of runs) {
      const steps = await workflowRepo.listSteps(run.id);
      for (const step of steps) expect(validKeys.has(step.stepKey)).toBe(true);

      const statuses = steps.map((s) => s.status);
      const running = statuses.indexOf("running");
      // Every step before the in-flight one is done, with real output.
      expect(running, `${run.title}: no running step`).toBeGreaterThan(0);
      const prefix = steps.slice(0, running);
      expect(
        prefix.map((s) => `${s.stepKey}:${s.status}`),
        `${run.title}: a seeded step key matched no pipeline step`,
      ).toEqual(prefix.map((s) => `${s.stepKey}:done`));
      for (const s of prefix) expect(s.output.length).toBeGreaterThan(0);
      // Nothing after the in-flight step has started.
      expect(statuses.slice(running + 1).every((s) => s === "pending")).toBe(
        true,
      );
    }
  });
});
