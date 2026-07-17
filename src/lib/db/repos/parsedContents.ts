import { db } from "@/lib/db";
import type { ParsedContent } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

/**
 * Extracted-text cache for binary/non-text files (#7). The embedding pipeline
 * reads `text` from here to index PDFs/Office docs/images/audio/web pages
 * without re-parsing on every sync. `upsert` keys by (projectId, path).
 */
export const parsedContentsRepo = {
  listByProject(projectId: string): Promise<ParsedContent[]> {
    return db.parsedContents.where("projectId").equals(projectId).toArray();
  },

  async getByPath(projectId: string, path: string): Promise<ParsedContent | undefined> {
    return (
      await db.parsedContents
        .where("projectId")
        .equals(projectId)
        .and((r) => r.path === path)
        .toArray()
    )[0];
  },

  /** Replace the cached parse for a path. Returns the saved row. */
  async upsert(
    input: Omit<ParsedContent, "id" | "parsedAt" | "updatedAt"> &
      Partial<Pick<ParsedContent, "id">>,
  ): Promise<ParsedContent> {
    const existing = input.id
      ? await db.parsedContents.get(input.id)
      : await this.getByPath(input.projectId, input.path);
    const ts = now();
    const row: ParsedContent = {
      id: existing?.id ?? input.id ?? uuid(),
      projectId: input.projectId,
      path: input.path,
      modality: input.modality,
      text: input.text,
      meta: input.meta,
      hash: input.hash,
      parsedAt: ts,
      updatedAt: ts,
    };
    await db.parsedContents.put(row);
    return row;
  },

  async removeByPath(projectId: string, path: string): Promise<void> {
    const ids = (
      await db.parsedContents
        .where("projectId")
        .equals(projectId)
        .and((r) => r.path === path)
        .primaryKeys()
    );
    if (ids.length) await db.parsedContents.bulkDelete(ids);
  },

  async removeForProject(projectId: string): Promise<void> {
    await db.parsedContents.where("projectId").equals(projectId).delete();
  },
};
