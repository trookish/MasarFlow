import { db } from "@/lib/db";
import { syncFileSchema, type ReplicaAdapter, type SyncFile } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

/** A file record to persist: everything except the db id (the adapter defaults to the folder mirror). */
export type SyncFileInput = Omit<SyncFile, "id" | "projectId" | "mtime" | "adapter"> & { adapter?: ReplicaAdapter };

/** The identity of an index row: its entity when it has one, otherwise its path. */
function keyOf(r: { entityType: string | null; entityId: string | null; path: string }): string {
  return r.entityId ? `e|${r.entityType}|${r.entityId}` : `p|${r.path}`;
}

/**
 * The replica index (v0.3 P3). Rows are upserted by identity and keep their id across runs, so
 * an interrupted run loses at most the row it was writing and nothing downstream sees churn.
 */
export const syncRepo = {
  async listByProject(projectId?: string | null, adapter?: ReplicaAdapter): Promise<SyncFile[]> {
    if (!projectId) return [];
    const rows = adapter
      ? await db.syncFiles.where("[projectId+adapter]").equals([projectId, adapter]).toArray()
      : await db.syncFiles.where("projectId").equals(projectId).toArray();
    return rows.sort((a, b) => a.path.localeCompare(b.path));
  },

  /** Insert or update one row, keeping the existing id for the same entity (or path). */
  async upsert(projectId: string, input: SyncFileInput): Promise<SyncFile> {
    const adapter = input.adapter ?? "folder";
    const key = keyOf(input);
    return db.transaction("rw", db.syncFiles, async () => {
      const existing = (await db.syncFiles.where("[projectId+adapter]").equals([projectId, adapter]).toArray()).find(
        (r) => keyOf(r) === key,
      );
      const row = syncFileSchema.parse({ ...input, adapter, id: existing?.id ?? uuid(), projectId, mtime: now() });
      await db.syncFiles.put(row);
      return row;
    });
  },

  async remove(id: string): Promise<void> {
    await db.syncFiles.delete(id);
  },

  /**
   * Make one adapter's index equal `files`: upsert every row (ids preserved) and delete only the
   * rows of that adapter that are no longer listed. Other adapters' rows are never touched.
   */
  async reconcile(projectId: string, files: SyncFileInput[], adapter: ReplicaAdapter = "folder"): Promise<void> {
    const ts = now();
    await db.transaction("rw", db.syncFiles, async () => {
      const existing = await db.syncFiles.where("[projectId+adapter]").equals([projectId, adapter]).toArray();
      const byKey = new Map(existing.map((r) => [keyOf(r), r]));
      const seen = new Set<string>();
      const rows = files.map((f) => {
        const key = keyOf(f);
        seen.add(key);
        return syncFileSchema.parse({ ...f, adapter, id: byKey.get(key)?.id ?? uuid(), projectId, mtime: ts });
      });
      const stale = existing.filter((r) => !seen.has(keyOf(r))).map((r) => r.id);
      if (stale.length) await db.syncFiles.bulkDelete(stale);
      await db.syncFiles.bulkPut(rows);
    });
  },
};
