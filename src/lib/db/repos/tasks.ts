import { db } from "@/lib/db";
import { taskSchema, type Task } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type TaskInput = Partial<Task> & Pick<Task, "projectId" | "title">;

/** Legacy rows can lack defaulted fields — normalize on read. */
function normalize(t: Task): Task {
  return {
    ...t,
    description: t.description ?? "",
    status: t.status ?? "backlog",
    priority: t.priority ?? "medium",
    specId: t.specId ?? null,
    sprintId: t.sprintId ?? null,
    parentTaskId: t.parentTaskId ?? null,
    assignee: t.assignee ?? "human",
    dependencies: t.dependencies ?? [],
    progress: t.progress ?? 0,
    tags: t.tags ?? [],
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
    const task = taskSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.tasks.add(task);
    return task;
  },
  async update(id: string, patch: Partial<Task>): Promise<void> {
    await db.tasks.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id: string): Promise<void> {
    await db.tasks.delete(id);
  },
};
