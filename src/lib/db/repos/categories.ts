import { db } from "@/lib/db";
import type { ProjectCategory } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

/** Per-project category names backing the "Add category" pickers. */
export const categoriesRepo = {
  async listByProject(projectId?: string | null): Promise<ProjectCategory[]> {
    if (!projectId) return [];
    return db.projectCategories
      .where("projectId")
      .equals(projectId)
      .sortBy("name");
  },

  /**
   * Create a category for a project. Case-insensitively deduped — a duplicate
   * name returns the existing row instead of inserting a second one.
   */
  async ensure(
    projectId: string,
    name: string,
  ): Promise<ProjectCategory> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Category name cannot be empty");
    const existing = await db.projectCategories
      .where("projectId")
      .equals(projectId)
      .toArray();
    const match = existing.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) return match;
    const ts = now();
    const category: ProjectCategory = {
      id: uuid(),
      projectId,
      name: trimmed,
      createdAt: ts,
    };
    await db.projectCategories.add(category);
    return category;
  },

  async remove(id: string): Promise<void> {
    await db.projectCategories.delete(id);
  },
};
