import { db } from "@/lib/db";
import type { Folder } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

export const foldersRepo = {
  async listByProject(projectId?: string | null): Promise<Folder[]> {
    if (!projectId) return [];
    return db.folders.where("projectId").equals(projectId).toArray();
  },

  async create(
    input: Pick<Folder, "projectId" | "name"> & Partial<Folder>,
  ): Promise<Folder> {
    const ts = now();
    const folder: Folder = {
      id: input.id ?? uuid(),
      projectId: input.projectId,
      name: input.name,
      parentId: input.parentId ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    await db.folders.add(folder);
    return folder;
  },

  async rename(id: string, name: string): Promise<void> {
    await db.folders.update(id, { name, updatedAt: now() });
  },

  /** Delete a folder; its notes fall back to the project root (folderId=null). */
  async remove(id: string): Promise<void> {
    await db.transaction("rw", [db.folders, db.notes], async () => {
      await db.notes.where("folderId").equals(id).modify({ folderId: null });
      await db.folders.where("parentId").equals(id).modify({ parentId: null });
      await db.folders.delete(id);
    });
  },
};
