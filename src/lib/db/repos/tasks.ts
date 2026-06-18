import { db } from "@/lib/db";
import { taskSchema, type Task } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type TaskInput = Partial<Task> & Pick<Task, "projectId" | "title">;

export const tasksRepo = {
  async listByProject(projectId?: string | null): Promise<Task[]> {
    if (!projectId) return [];
    return db.tasks.where("projectId").equals(projectId).toArray();
  },
  get(id: string): Promise<Task | undefined> {
    return db.tasks.get(id);
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
