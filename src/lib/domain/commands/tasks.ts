import { db } from "@/lib/db";
import type { Task } from "@/lib/db/schema";
import { deriveProgress, specProgress } from "../task-model";
import type { Actor } from "../events";
import { runCommand, type CommandTx } from "./kernel";

/** Fields the caller may set. Progress is derived (see task-model.ts) and is ignored if passed. */
export type TaskPatch = Partial<
  Omit<Task, "id" | "projectId" | "createdAt" | "progress">
> & { progress?: number };

async function refreshSpec(
  specId: string | null | undefined,
  at: number,
): Promise<void> {
  if (!specId || !(await db.specs.get(specId))) return;
  const tasks = await db.tasks.where("specId").equals(specId).toArray();
  await db.specs.update(specId, {
    implementationProgress: specProgress(tasks),
    updatedAt: at,
  });
}

/** Re-derive a parent's progress from its subtasks, walking up the tree. */
async function refreshParent(
  parentId: string | null | undefined,
  at: number,
  seen = new Set<string>(),
): Promise<void> {
  if (!parentId || seen.has(parentId)) return;
  seen.add(parentId);
  const parent = await db.tasks.get(parentId);
  if (!parent) return;
  const children = await db.tasks
    .filter((t) => t.parentTaskId === parentId)
    .toArray();
  const progress = deriveProgress(parent.status, children);
  if (progress !== parent.progress)
    await db.tasks.update(parentId, { progress, updatedAt: at });
  await refreshParent(parent.parentTaskId, at, seen);
}

/** Apply derived progress for one task and everything that aggregates it. Runs inside a command. */
export async function settleTask(
  id: string,
  tx: Pick<CommandTx, "at">,
  before?: Pick<Task, "specId" | "parentTaskId">,
) {
  const task = await db.tasks.get(id);
  if (!task) return;
  const children = await db.tasks
    .filter((t) => t.parentTaskId === id)
    .toArray();
  const progress = deriveProgress(task.status ?? "backlog", children);
  if (progress !== task.progress) await db.tasks.update(id, { progress });
  for (const specId of new Set([before?.specId, task.specId]))
    await refreshSpec(specId, tx.at);
  for (const parentId of new Set([before?.parentTaskId, task.parentTaskId]))
    await refreshParent(parentId, tx.at);
}

/**
 * Change a task. Status drives progress; the task's spec (old and new) and its parent tasks are
 * updated in the same transaction, with one event in the feed.
 */
export async function updateTask(
  id: string,
  patch: TaskPatch,
  actor: Actor = "user",
): Promise<void> {
  const { progress: _ignored, ...rest } = patch;
  void _ignored;
  await runCommand([db.tasks, db.specs], actor, async (tx) => {
    const before = await db.tasks.get(id);
    if (!before) return;
    // One write for the task itself (progress included), so the activity feed sees one change.
    const children = await db.tasks
      .filter((t) => t.parentTaskId === id)
      .toArray();
    const progress = deriveProgress(
      rest.status ?? before.status ?? "backlog",
      children,
    );
    await db.tasks.update(id, { ...rest, progress, updatedAt: tx.at });
    await settleTask(id, tx, before);
    tx.emit({
      projectId: before.projectId,
      entityKind: "task",
      entityId: id,
      op: "update",
      patch: rest,
    });
  });
}
