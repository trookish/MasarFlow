import { db } from "@/lib/db";
import { aiUndoSchema, type AiUndo } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type AiUndoInput = Omit<AiUndo, "id" | "createdAt">;

/** Display title/name of an entity row, when present. */
function rowLabel(row: unknown): string {
  const r = row as { title?: unknown; name?: unknown } | undefined;
  return String(r?.title ?? r?.name ?? "").trim();
}

/**
 * Undo ledger for AI-made workspace changes. Every mutating agent tool call
 * records a reversible row (entity snapshot before/after); `revert` rolls the
 * change back against the raw Dexie table so it works for every entity kind.
 */
export const aiUndoRepo = {
  async create(input: AiUndoInput): Promise<AiUndo> {
    const entry = aiUndoSchema.parse({
      ...input,
      id: uuid(),
      createdAt: now(),
    });
    await db.aiUndo.add(entry);
    return entry;
  },

  listByProject(projectId?: string | null): Promise<AiUndo[]> {
    if (!projectId) return Promise.resolve([]);
    return db.aiUndo.where("projectId").equals(projectId).toArray();
  },

  listByMessage(chatMessageId: string | null): Promise<AiUndo[]> {
    if (!chatMessageId) return Promise.resolve([]);
    return db.aiUndo
      .where("chatMessageId")
      .equals(chatMessageId)
      .reverse()
      .sortBy("createdAt");
  },

  async remove(id: string): Promise<void> {
    await db.aiUndo.delete(id);
  },

  /** Human-readable summary of the recorded change, e.g. "update note X". */
  describe(entry: AiUndo): string {
    const label =
      rowLabel(entry.after) || rowLabel(entry.before) || entry.entityId;
    return `${entry.action} ${entry.kind} ${label}`.trim();
  },

  /**
   * Undo one recorded mutation:
   *  - create  → delete the entity that was created
   *  - delete  → re-insert the pre-mutation row
   *  - update  → restore the pre-mutation fields (id/projectId/createdAt kept)
   * Removes the ledger row afterwards. Returns the entity's display label.
   */
  async revert(entry: AiUndo): Promise<string> {
    const table = db.table<Record<string, unknown>, string>(entry.table);
    const before = (entry.before ?? undefined) as
      | Record<string, unknown>
      | undefined;

    if (entry.action === "create") {
      await table.delete(entry.entityId);
    } else if (entry.action === "delete" && before) {
      await table.add(before as never);
    } else if (entry.action === "update" && before) {
      const patch = { ...before };
      delete patch.id;
      delete patch.projectId;
      delete patch.createdAt;
      await table.update(entry.entityId, patch as never);
    }

    await db.aiUndo.delete(entry.id);
    return this.describe(entry);
  },
};
