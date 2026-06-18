import { db } from "@/lib/db";
import { sprintSchema, type Sprint } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type SprintInput = Partial<Sprint> & Pick<Sprint, "projectId" | "name">;

export const sprintsRepo = {
  async listByProject(projectId?: string | null): Promise<Sprint[]> {
    if (!projectId) return [];
    return db.sprints.where("projectId").equals(projectId).toArray();
  },
  get(id: string): Promise<Sprint | undefined> {
    return db.sprints.get(id);
  },
  async create(input: SprintInput): Promise<Sprint> {
    const ts = now();
    const sprint = sprintSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.sprints.add(sprint);
    return sprint;
  },
  async update(id: string, patch: Partial<Sprint>): Promise<void> {
    await db.sprints.update(id, { ...patch, updatedAt: now() });
  },
  /** Delete a sprint and unassign its tasks. */
  async remove(id: string): Promise<void> {
    await db.transaction("rw", [db.sprints, db.tasks], async () => {
      await db.tasks.where("sprintId").equals(id).modify({ sprintId: null });
      await db.sprints.delete(id);
    });
  },
};
