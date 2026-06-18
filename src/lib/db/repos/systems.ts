import { db } from "@/lib/db";
import { systemSchema, type System } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type SystemInput = Partial<System> & Pick<System, "projectId" | "name">;

export const systemsRepo = {
  listByProject(projectId: string): Promise<System[]> {
    return db.systems.where("projectId").equals(projectId).toArray();
  },
  get(id: string): Promise<System | undefined> {
    return db.systems.get(id);
  },
  async create(input: SystemInput): Promise<System> {
    const ts = now();
    const system = systemSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.systems.add(system);
    return system;
  },
  async update(id: string, patch: Partial<System>): Promise<void> {
    await db.systems.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id: string): Promise<void> {
    await db.systems.delete(id);
  },
};
