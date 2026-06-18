import { db } from "@/lib/db";
import { standardSchema, type Standard } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type StandardInput = Partial<Standard> &
  Pick<Standard, "projectId" | "title" | "rule">;

export const standardsRepo = {
  async listByProject(projectId?: string | null): Promise<Standard[]> {
    if (!projectId) return [];
    return db.standards.where("projectId").equals(projectId).toArray();
  },
  get(id: string): Promise<Standard | undefined> {
    return db.standards.get(id);
  },
  async create(input: StandardInput): Promise<Standard> {
    const ts = now();
    const standard = standardSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.standards.add(standard);
    return standard;
  },
  async update(id: string, patch: Partial<Standard>): Promise<void> {
    await db.standards.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id: string): Promise<void> {
    await db.standards.delete(id);
  },
};
