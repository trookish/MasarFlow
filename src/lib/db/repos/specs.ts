import { db } from "@/lib/db";
import { specSchema, type Spec } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type SpecInput = Partial<Spec> & Pick<Spec, "projectId" | "number" | "title">;

export const specsRepo = {
  async listByProject(projectId?: string | null): Promise<Spec[]> {
    if (!projectId) return [];
    return db.specs.where("projectId").equals(projectId).toArray();
  },
  get(id: string): Promise<Spec | undefined> {
    return db.specs.get(id);
  },
  async create(input: SpecInput): Promise<Spec> {
    const ts = now();
    const spec = specSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.specs.add(spec);
    return spec;
  },
  async update(id: string, patch: Partial<Spec>): Promise<void> {
    await db.specs.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id: string): Promise<void> {
    await db.specs.delete(id);
  },
};
