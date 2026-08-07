import { db } from "@/lib/db";
import { systemSchema, type System } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type SystemInput = Partial<System> & Pick<System, "projectId" | "name">;

/**
 * Legacy rows (written before these fields existed in the schema) can have
 * them missing — normalize on read so no consumer ever hits undefined.
 */
function normalize(s: System): System {
  return {
    ...s,
    description: s.description ?? "",
    category: s.category ?? "module",
    status: s.status ?? "active",
    health: typeof s.health === "number" ? s.health : 100,
    dependencies: s.dependencies ?? [],
  };
}

export const systemsRepo = {
  async listByProject(projectId?: string | null): Promise<System[]> {
    if (!projectId) return [];
    return (await db.systems.where("projectId").equals(projectId).toArray()).map(
      normalize,
    );
  },
  async get(id: string): Promise<System | undefined> {
    const s = await db.systems.get(id);
    return s ? normalize(s) : undefined;
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
