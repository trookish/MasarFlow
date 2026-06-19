import { db } from "@/lib/db";
import { docSchema, type Doc } from "@/lib/db/schema";
import { uuid, now, slugify } from "@/lib/utils/ids";

type DocInput = Partial<Doc> & Pick<Doc, "projectId" | "title">;

export const docsRepo = {
  async listByProject(projectId?: string | null): Promise<Doc[]> {
    if (!projectId) return [];
    return db.docs.where("projectId").equals(projectId).toArray();
  },
  get(id: string): Promise<Doc | undefined> {
    return db.docs.get(id);
  },
  async create(input: DocInput): Promise<Doc> {
    const ts = now();
    const doc = docSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      slug: input.slug ?? slugify(input.title || "untitled"),
      createdAt: input.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.docs.add(doc);
    return doc;
  },
  async update(id: string, patch: Partial<Doc>): Promise<void> {
    // Keep the slug in sync when the title changes so deep-links stay readable.
    const next =
      patch.title !== undefined && patch.slug === undefined
        ? { ...patch, slug: slugify(patch.title || "untitled") }
        : patch;
    await db.docs.update(id, { ...next, updatedAt: now() });
  },
  async remove(id: string): Promise<void> {
    await db.docs.delete(id);
  },
};
