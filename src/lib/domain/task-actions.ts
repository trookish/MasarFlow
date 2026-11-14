import { specsRepo, tasksRepo } from "@/lib/db/repos";
import type { Task } from "@/lib/db/schema";

async function recomputeSpecs(...specIds: Array<string | null | undefined>): Promise<void> {
  for (const id of new Set(specIds.filter((x): x is string => Boolean(x)))) {
    await specsRepo.recomputeProgress(id);
  }
}

/** Update a task and keep the progress of the spec it left and the spec it joined in step. */
export async function patchTask(task: Pick<Task, "id" | "specId">, patch: Partial<Task>): Promise<void> {
  await tasksRepo.update(task.id, patch);
  await recomputeSpecs(task.specId, patch.specId);
}

export async function deleteTask(task: Pick<Task, "id" | "specId">): Promise<void> {
  await tasksRepo.remove(task.id);
  await recomputeSpecs(task.specId);
}
