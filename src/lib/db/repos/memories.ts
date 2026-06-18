import { db } from "@/lib/db";
import { memorySchema, type Memory } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type MemoryInput = Partial<Memory> & Pick<Memory, "projectId" | "content">;

export const memoriesRepo = {
  async listByProject(projectId?: string | null): Promise<Memory[]> {
    if (!projectId) return [];
    return db.memories.where("projectId").equals(projectId).toArray();
  },
  get(id: string): Promise<Memory | undefined> {
    return db.memories.get(id);
  },
  async create(input: MemoryInput): Promise<Memory> {
    const ts = now();
    const memory = memorySchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.memories.add(memory);
    return memory;
  },
  async update(id: string, patch: Partial<Memory>): Promise<void> {
    await db.memories.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id: string): Promise<void> {
    await db.memories.delete(id);
  },
};
