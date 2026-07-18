import { db } from "../index";
import { linkedProjectSchema, type LinkedProject } from "../schema";
import { uuid, now } from "@/lib/utils/ids";

/**
 * External project folders linked to a workspace project. These are the only
 * roots the agentic filesystem/shell tools may touch — the /api/fs routes
 * re-validate every requested path against this registry.
 */
export const linkedProjectsRepo = {
  listByProject(projectId: string): Promise<LinkedProject[]> {
    return db.linkedProjects
      .where("projectId")
      .equals(projectId)
      .sortBy("createdAt");
  },

  get(id: string): Promise<LinkedProject | undefined> {
    return db.linkedProjects.get(id);
  },

  async create(input: {
    projectId: string;
    name: string;
    rootPath: string;
  }): Promise<LinkedProject> {
    const item = linkedProjectSchema.parse({
      id: uuid(),
      projectId: input.projectId,
      name: input.name.trim(),
      rootPath: input.rootPath.trim(),
      createdAt: now(),
    });
    await db.linkedProjects.add(item);
    return item;
  },

  async update(
    id: string,
    patch: Partial<Pick<LinkedProject, "name" | "rootPath">>,
  ): Promise<void> {
    await db.linkedProjects.update(id, patch);
  },

  async remove(id: string): Promise<void> {
    await db.linkedProjects.delete(id);
  },
};
