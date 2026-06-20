import { db } from "@/lib/db";
import { syncFileSchema, type SyncFile } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

/** A file record to persist — everything except the db id. */
export type SyncFileInput = Omit<SyncFile, "id" | "projectId" | "mtime">;

export const syncRepo = {
  async listByProject(projectId?: string | null): Promise<SyncFile[]> {
    if (!projectId) return [];
    return db.syncFiles.where("projectId").equals(projectId).sortBy("path");
  },

  /**
   * Replace the project's entire file index in one transaction. Scan and Sync
   * both compute the desired list of records and hand it here.
   */
  async replaceAll(projectId: string, files: SyncFileInput[]): Promise<void> {
    const ts = now();
    const records = files.map((f) =>
      syncFileSchema.parse({ ...f, id: uuid(), projectId, mtime: ts }),
    );
    await db.transaction("rw", db.syncFiles, async () => {
      await db.syncFiles.where("projectId").equals(projectId).delete();
      await db.syncFiles.bulkAdd(records);
    });
  },
};
