import { db } from "@/lib/db";
import {
  workflowRunSchema,
  workflowStepSchema,
  type WorkflowRun,
  type WorkflowStep,
} from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";
import { WORKFLOW_STEPS } from "@/lib/ai/workflow";

export const workflowRepo = {
  async listRuns(projectId?: string | null): Promise<WorkflowRun[]> {
    if (!projectId) return [];
    return db.workflowRuns
      .where("projectId")
      .equals(projectId)
      .reverse()
      .sortBy("updatedAt");
  },
  getRun(id: string): Promise<WorkflowRun | undefined> {
    return db.workflowRuns.get(id);
  },

  /** Create a run and seed its 16 pending steps in one transaction. */
  async createRun(
    input: Pick<WorkflowRun, "projectId" | "connectionId" | "modelId"> &
      Partial<WorkflowRun>,
  ): Promise<WorkflowRun> {
    const ts = now();
    const run = workflowRunSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    const steps = WORKFLOW_STEPS.map((s, i) =>
      workflowStepSchema.parse({
        id: uuid(),
        runId: run.id,
        stepKey: s.key,
        order: i,
        status: "pending",
        output: "",
        createdAt: ts,
        updatedAt: ts,
      }),
    );
    await db.transaction("rw", [db.workflowRuns, db.workflowSteps], async () => {
      await db.workflowRuns.add(run);
      await db.workflowSteps.bulkAdd(steps);
    });
    return run;
  },

  async updateRun(id: string, patch: Partial<WorkflowRun>): Promise<void> {
    await db.workflowRuns.update(id, { ...patch, updatedAt: now() });
  },

  listSteps(runId: string): Promise<WorkflowStep[]> {
    return db.workflowSteps.where("runId").equals(runId).sortBy("order");
  },

  async updateStep(id: string, patch: Partial<WorkflowStep>): Promise<void> {
    await db.workflowSteps.update(id, { ...patch, updatedAt: now() });
  },

  async remove(id: string): Promise<void> {
    await db.transaction("rw", [db.workflowRuns, db.workflowSteps], async () => {
      await db.workflowSteps.where("runId").equals(id).delete();
      await db.workflowRuns.delete(id);
    });
  },
};
