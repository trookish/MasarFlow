import { db } from "@/lib/db";
import { taskSchema, type Task } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";
import { removeEntity, runCommand, settleTask, updateTask } from "@/lib/domain/commands";
import { deriveProgress } from "@/lib/domain/task-model";

type TaskInput = Partial<Task> & Pick<Task, "projectId" | "title">;

/** Legacy rows can lack defaulted fields — normalize on read. */
function normalize(t: Task): Task {
  return {
    ...t,
    description: t.description ?? "",
    status: t.status ?? "backlog",
    priority: t.priority ?? "medium",
    dueDate: t.dueDate ?? null,
    specId: t.specId ?? null,
    sprintId: t.sprintId ?? null,
    parentTaskId: t.parentTaskId ?? null,
    assignee: t.assignee ?? "human",
    dependencies: t.dependencies ?? [],
    progress: t.progress ?? 0,
    tags: t.tags ?? [],
    externalRef: t.externalRef ?? "",
  };
}

export const tasksRepo = {
  async listByProject(projectId?: string | null): Promise<Task[]> {
    if (!projectId) return [];
    return (await db.tasks.where("projectId").equals(projectId).toArray()).map(
      normalize,
    );
  },
  async get(id: string): Promise<Task | undefined> {
    const t = await db.tasks.get(id);
    return t ? normalize(t) : undefined;
  },
  async create(input: TaskInput): Promise<Task> {
    const ts = now();
    const parsed = taskSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    // Progress follows status (task-model.ts); a new task has no subtasks yet.
    const task = { ...parsed, progress: deriveProgress(parsed.status) };
    await runCommand([db.tasks, db.specs], "user", async (tx) => {
      await db.tasks.add(task);
      if (task.specId || task.parentTaskId) await settleTask(task.id, tx, { specId: null, parentTaskId: null });
    });
    return task;
  },
  /** Status drives progress; the task's specs and parent tasks update with it (one command). */
  async update(id: string, patch: Partial<Task>): Promise<void> {
    await updateTask(id, patch);
  },
  /** Moves the task to the trash and cleans every reference to it (links, linkedTaskIds, spec progress). */
  async remove(id: string): Promise<void> {
    await removeEntity("task", id);
  },
};
