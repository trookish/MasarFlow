import { db } from "@/lib/db";
import type { LinkSuggestion } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

/**
 * Reviewable predicted graph edges (#5). `accept` marks a suggestion accepted;
 * promoting it to a real `Link` is the caller's job (via linksRepo.create) so
 * the suggestion row stays as a historical record of what was accepted.
 */
export const linkSuggestionsRepo = {
  listByProject(projectId: string): Promise<LinkSuggestion[]> {
    return db.linkSuggestions.where("projectId").equals(projectId).toArray();
  },

  listPending(projectId: string): Promise<LinkSuggestion[]> {
    return db.linkSuggestions
      .where("[projectId+status]")
      .equals([projectId, "pending"])
      .toArray();
  },

  async create(
    input: Omit<LinkSuggestion, "id" | "createdAt" | "status"> &
      Partial<Pick<LinkSuggestion, "id" | "status">>,
  ): Promise<LinkSuggestion> {
    const row: LinkSuggestion = {
      id: input.id ?? uuid(),
      projectId: input.projectId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      linkType: input.linkType,
      score: input.score,
      reason: input.reason,
      status: input.status ?? "pending",
      createdAt: now(),
    };
    await db.linkSuggestions.add(row);
    return row;
  },

  async setStatus(id: string, status: LinkSuggestion["status"]): Promise<void> {
    await db.linkSuggestions.update(id, { status });
  },

  async remove(id: string): Promise<void> {
    await db.linkSuggestions.delete(id);
  },

  async removeForProject(projectId: string): Promise<void> {
    await db.linkSuggestions.where("projectId").equals(projectId).delete();
  },
};
