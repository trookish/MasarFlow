import { db } from "@/lib/db";
import { commitSchema, type Commit } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type CommitInput = Partial<Commit> &
  Pick<Commit, "projectId" | "sha" | "message" | "date">;

/**
 * Legacy rows (written before these fields existed) can be missing them —
 * normalize on read so no consumer ever hits undefined.
 */
function normalize(c: Commit): Commit {
  return {
    ...c,
    sha: c.sha ?? "",
    message: c.message ?? "",
    author: c.author ?? "",
    date: c.date ?? 0,
    files: c.files ?? [],
    additions: c.additions ?? 0,
    deletions: c.deletions ?? 0,
    aiSummary: c.aiSummary ?? "",
    linkedSpecIds: c.linkedSpecIds ?? [],
    linkedTaskIds: c.linkedTaskIds ?? [],
  };
}

export const commitsRepo = {
  async listByProject(projectId?: string | null): Promise<Commit[]> {
    if (!projectId) return [];
    return (await db.commits
      .where("projectId")
      .equals(projectId)
      .reverse()
      .sortBy("date")).map(normalize);
  },
  async get(id: string): Promise<Commit | undefined> {
    const c = await db.commits.get(id);
    return c ? normalize(c) : undefined;
  },
  async update(id: string, patch: Partial<Commit>): Promise<void> {
    await db.commits.update(id, patch);
  },
  async create(input: CommitInput): Promise<Commit> {
    const commit = commitSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? now(),
    });
    await db.commits.add(commit);
    return commit;
  },
  async remove(id: string): Promise<void> {
    await db.commits.delete(id);
  },
};
