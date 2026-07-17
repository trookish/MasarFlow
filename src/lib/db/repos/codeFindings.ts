import { db } from "@/lib/db";
import type { CodeFinding } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

/**
 * Persisted tree-sitter code-analysis reports (#4). One row per analyzed
 * file; re-analysis replaces the row for that path. Read by the enforcer
 * panel and the tech-debt metric instead of recomputing on every render.
 */
export const codeFindingsRepo = {
  listByProject(projectId: string): Promise<CodeFinding[]> {
    return db.codeFindings.where("projectId").equals(projectId).toArray();
  },

  async getByPath(projectId: string, path: string): Promise<CodeFinding | undefined> {
    return (
      await db.codeFindings
        .where("projectId")
        .equals(projectId)
        .and((r) => r.path === path)
        .toArray()
    )[0];
  },

  /** Replace the report for a path (re-analysis). Returns the saved row. */
  async upsert(
    input: Omit<CodeFinding, "id" | "analyzedAt" | "updatedAt"> &
      Partial<Pick<CodeFinding, "id">>,
  ): Promise<CodeFinding> {
    const existing = input.id
      ? await db.codeFindings.get(input.id)
      : await this.getByPath(input.projectId, input.path);
    const ts = now();
    const row: CodeFinding = {
      id: existing?.id ?? input.id ?? uuid(),
      projectId: input.projectId,
      path: input.path,
      language: input.language,
      violations: input.violations,
      metrics: input.metrics,
      symbols: input.symbols,
      analyzedAt: ts,
      updatedAt: ts,
    };
    await db.codeFindings.put(row);
    return row;
  },

  async removeByPath(projectId: string, path: string): Promise<void> {
    const ids = (
      await db.codeFindings
        .where("projectId")
        .equals(projectId)
        .and((r) => r.path === path)
        .primaryKeys()
    );
    if (ids.length) await db.codeFindings.bulkDelete(ids);
  },

  async removeForProject(projectId: string): Promise<void> {
    await db.codeFindings.where("projectId").equals(projectId).delete();
  },
};
