import { db } from "@/lib/db";
import { commitSchema, type Commit } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

type CommitInput = Partial<Commit> &
  Pick<Commit, "projectId" | "sha" | "message" | "date">;

export const commitsRepo = {
  async listByProject(projectId?: string | null): Promise<Commit[]> {
    if (!projectId) return [];
    return db.commits
      .where("projectId")
      .equals(projectId)
      .reverse()
      .sortBy("date");
  },
  get(id: string): Promise<Commit | undefined> {
    return db.commits.get(id);
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
