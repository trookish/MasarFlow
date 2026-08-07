import { db } from "@/lib/db";
import { specSchema, type Spec } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type SpecInput = Partial<Spec> & Pick<Spec, "projectId" | "number" | "title">;

/** Legacy rows can lack defaulted fields — normalize on read. */
function normalize(s: Spec): Spec {
  return {
    ...s,
    status: s.status ?? "draft",
    purpose: s.purpose ?? "",
    goals: s.goals ?? [],
    features: s.features ?? [],
    constraints: s.constraints ?? [],
    dependencies: s.dependencies ?? [],
    acceptance: s.acceptance ?? [],
    risks: s.risks ?? [],
    futureImprovements: s.futureImprovements ?? [],
    technicalNotes: s.technicalNotes ?? "",
    implementationProgress: s.implementationProgress ?? 0,
    linkedNoteIds: s.linkedNoteIds ?? [],
    linkedTaskIds: s.linkedTaskIds ?? [],
  };
}

export const specsRepo = {
  async listByProject(projectId?: string | null): Promise<Spec[]> {
    if (!projectId) return [];
    return (await db.specs.where("projectId").equals(projectId).toArray()).map(
      normalize,
    );
  },
  async get(id: string): Promise<Spec | undefined> {
    const s = await db.specs.get(id);
    return s ? normalize(s) : undefined;
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
  /**
   * Recompute a spec's implementation progress from its linked tasks
   * (% of tasks in the `done` status) and persist it. No-op if the spec is
   * gone. Call after any task with this specId is created/updated/removed.
   */
  async recomputeProgress(specId: string): Promise<void> {
    const tasks = await db.tasks.where("specId").equals(specId).toArray();
    const progress = tasks.length
      ? Math.round(
          (tasks.filter((t) => t.status === "done").length / tasks.length) *
            100,
        )
      : 0;
    await db.specs.update(specId, {
      implementationProgress: progress,
      updatedAt: now(),
    });
  },
};
