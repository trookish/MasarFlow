import { commitsRepo } from "@/lib/db/repos/commits";
import { devLogsRepo } from "@/lib/db/repos/devLogs";
import { linksRepo } from "@/lib/db/repos/links";
import { tasksRepo } from "@/lib/db/repos/tasks";
import type { Commit, Link } from "@/lib/db/schema";
import { firstLine } from "@/lib/utils/text";

/**
 * Local-commit ⇄ task linking, on the P5 entity fabric:
 *  - the commit becomes a normal `commits` row (kind "commit" already exists in
 *    entityKindSchema and the activity tracker already covers that table, so the
 *    activity entry costs nothing extra here — writing a second one would
 *    duplicate it, F10);
 *  - the relationship is a `links` row (commit --implements--> task), which is
 *    exactly what github-sync.ts writes for GitHub commits, so the graph, the
 *    backlinks panel and the chips all light up with no new tables;
 *  - `commit.linkedTaskIds` is kept in sync for the dashboard commits panel,
 *    which reads that field directly.
 */

export interface RecordLocalCommitInput {
  projectId: string | null;
  root: string;
  sha: string;
  message: string;
  author?: string;
  /** ISO-8601 (git %aI) or epoch ms. */
  date?: string | number;
  files?: string[];
  additions?: number;
  deletions?: number;
}

export interface RecordLocalCommitResult {
  commit: Commit;
  /** false when a row with that sha already existed (amend / re-record). */
  created: boolean;
}

const toMs = (input: string | number | undefined): number => {
  if (typeof input === "number") return input;
  if (typeof input === "string") {
    const ms = Date.parse(input);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
};

export async function recordLocalCommit(
  input: RecordLocalCommitInput,
): Promise<RecordLocalCommitResult> {
  const projectId = input.projectId ?? "";
  if (!projectId) throw new Error("recordLocalCommit needs a projectId");
  const existing = (await commitsRepo.listByProject(projectId)).find((c) => c.sha === input.sha);
  const date = toMs(input.date);

  if (existing) {
    await commitsRepo.update(existing.id, {
      message: input.message,
      author: input.author ?? existing.author,
      date,
      files: input.files ?? existing.files,
      additions: input.additions ?? existing.additions,
      deletions: input.deletions ?? existing.deletions,
    });
    const updated = await commitsRepo.get(existing.id);
    return { commit: updated ?? existing, created: false };
  }

  const commit = await commitsRepo.create({
    projectId,
    sha: input.sha,
    message: input.message,
    author: input.author ?? "",
    date,
    files: input.files ?? [],
    additions: input.additions ?? 0,
    deletions: input.deletions ?? 0,
  });

  await devLogsRepo.create({
    projectId,
    type: "commit",
    title: firstLine(input.message) || input.sha.slice(0, 7),
    body: input.message,
    refType: "commit",
    refId: commit.id,
  });

  return { commit, created: true };
}

export interface LinkCommitInput {
  projectId: string;
  commitId: string;
  taskId: string;
  /** Optional free-text note stored on the link row. */
  label?: string;
}

/** Idempotent: the same (commit, task) pair yields at most one link row. */
export async function linkCommitToTask(input: LinkCommitInput): Promise<Link> {
  const existing = (await linksRepo.listBySource("commit", input.commitId)).find(
    (l) => l.targetType === "task" && l.targetId === input.taskId,
  );
  const link =
    existing ??
    (await linksRepo.create({
      projectId: input.projectId,
      sourceType: "commit",
      sourceId: input.commitId,
      targetType: "task",
      targetId: input.taskId,
      linkType: "implements",
      label: input.label ?? "",
    }));

  const commit = await commitsRepo.get(input.commitId);
  if (commit && !commit.linkedTaskIds.includes(input.taskId)) {
    await commitsRepo.update(input.commitId, {
      linkedTaskIds: [...commit.linkedTaskIds, input.taskId],
    });
  }
  return link;
}

/** Remove the link row and the mirrored id on the commit. */
export async function unlinkCommitFromTask(input: {
  commitId: string;
  taskId: string;
}): Promise<void> {
  const links = await linksRepo.listBySource("commit", input.commitId);
  for (const link of links) {
    if (link.targetType === "task" && link.targetId === input.taskId) {
      await linksRepo.remove(link.id);
    }
  }
  const commit = await commitsRepo.get(input.commitId);
  if (commit) {
    await commitsRepo.update(input.commitId, {
      linkedTaskIds: commit.linkedTaskIds.filter((id) => id !== input.taskId),
    });
  }
}

/** Tasks suggested for a commit message: same-project tasks whose title words appear in it. */
export async function suggestTasksForMessage(
  projectId: string | null,
  message: string,
): Promise<string[]> {
  if (!projectId) return [];
  const haystack = message.toLowerCase();
  const tasks = await tasksRepo.listByProject(projectId);
  return tasks
    .filter((task) => {
      const words = task.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      return words.length > 0 && words.every((w) => haystack.includes(w));
    })
    .map((task) => task.id);
}
