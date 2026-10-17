import { db } from "@/lib/db";
import { activitySchema, type Activity } from "@/lib/db/schema";
import type { ActivityDraft } from "@/lib/activity/describe";
import { uuid, now } from "@/lib/utils/ids";

export const MAX_ACTIVITY_PER_PROJECT = 2000;
let lastTs = 0;

export const activityRepo = {
  async listRecent(projectId: string, limit = 20): Promise<Activity[]> {
    return db.activity
      .where("[projectId+createdAt]")
      .between([projectId, 0], [projectId, Infinity])
      .reverse()
      .limit(limit)
      .toArray();
  },
  async listForEntity(projectId: string, kind: string, id: string): Promise<Activity[]> {
    const rows = await db.activity
      .where("[projectId+entityKind+entityId]")
      .equals([projectId, kind, id])
      .toArray();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
  /** createdAt is strictly increasing across calls, so "newest first" never ties. */
  async addMany(drafts: ActivityDraft[]): Promise<void> {
    if (drafts.length === 0) return;
    const base = Math.max(now(), lastTs + 1);
    lastTs = base + drafts.length - 1;
    await db.activity.bulkAdd(
      drafts.map((d, i) => activitySchema.parse({ ...d, id: uuid(), createdAt: base + i })),
    );
  },
  /** Keep only the newest `keep` rows of a project. */
  async prune(projectId: string, keep = MAX_ACTIVITY_PER_PROJECT): Promise<number> {
    const total = await db.activity.where("projectId").equals(projectId).count();
    if (total <= keep) return 0;
    const old = await db.activity
      .where("[projectId+createdAt]")
      .between([projectId, 0], [projectId, Infinity])
      .limit(total - keep)
      .primaryKeys();
    await db.activity.bulkDelete(old);
    return old.length;
  },
};
