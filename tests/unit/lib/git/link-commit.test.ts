import { describe, it, expect, beforeEach } from "vitest";
import { freshDb } from "../../_helpers/db";
import { db } from "@/lib/db";
import { linkCommitToTask, recordLocalCommit } from "@/lib/git/link-commit";
import { tasksRepo } from "@/lib/db/repos/tasks";
import { linksRepo } from "@/lib/db/repos/links";
import { commitsRepo } from "@/lib/db/repos/commits";
import { devLogsRepo } from "@/lib/db/repos/devLogs";

const projectId = "p1";

async function seedTask(title: string) {
  return tasksRepo.create({ projectId, title, description: "", status: "todo", priority: "medium" });
}

describe("recordLocalCommit", () => {
  beforeEach(async () => {
    await freshDb(["commits", "links", "devLogs", "tasks"]);
  });

  it("mirrors a local commit into the commits table with the parsed date", async () => {
    const { commit, created } = await recordLocalCommit({
      projectId,
      root: "C:\\proj",
      sha: "ef0c80f18579bb4ce75cb62be767f81501595310",
      message: "feat(git): panel\n\nbody line",
      author: "Dev Example",
      date: "2026-10-16T23:46:58+03:00",
      files: ["a.txt"],
      additions: 3,
      deletions: 1,
    });
    expect(created).toBe(true);
    expect(commit.date).toBe(Date.parse("2026-10-16T23:46:58+03:00"));
    expect(commit.message).toBe("feat(git): panel\n\nbody line");
    expect(await commitsRepo.listByProject(projectId)).toHaveLength(1);
  });

  it("is idempotent per sha: a second call updates instead of duplicating", async () => {
    const input = {
      projectId, root: "C:\\proj",
      sha: "649b5328e4c0fd2aa29cccfa112b0d7ef1fdda28",
      message: "feat: first", author: "Dev", date: "2026-10-16T20:00:00Z",
      files: [], additions: 0, deletions: 0,
    };
    const first = await recordLocalCommit(input);
    const second = await recordLocalCommit({ ...input, message: "feat: first (amended)" });
    expect(second.created).toBe(false);
    expect(second.commit.id).toBe(first.commit.id);
    expect((await commitsRepo.listByProject(projectId))).toHaveLength(1);
    expect(second.commit.message).toBe("feat: first (amended)");
  });

  it("writes one devlog entry, not one per call", async () => {
    const input = {
      projectId, root: "C:\\proj", sha: "a".repeat(40),
      message: "feat: x", author: "Dev", date: "2026-10-16T20:00:00Z", files: [], additions: 0, deletions: 0,
    };
    await recordLocalCommit(input);
    await recordLocalCommit(input);
    expect(await devLogsRepo.listByProject(projectId)).toHaveLength(1);
  });
});

describe("linkCommitToTask", () => {
  beforeEach(async () => {
    await freshDb(["commits", "links", "devLogs", "tasks"]);
  });

  it("creates an implements link, updates the task side of the commit and de-duplicates", async () => {
    const task = await seedTask("Ship the git panel");
    const { commit } = await recordLocalCommit({
      projectId, root: "C:\\proj", sha: "b".repeat(40), message: "feat: y",
      author: "Dev", date: "2026-10-16T20:00:00Z", files: [], additions: 0, deletions: 0,
    });

    await linkCommitToTask({ projectId, commitId: commit.id, taskId: task.id });
    await linkCommitToTask({ projectId, commitId: commit.id, taskId: task.id });

    const links = await linksRepo.listByProject(projectId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      sourceType: "commit", sourceId: commit.id,
      targetType: "task", targetId: task.id,
      linkType: "implements",
    });
    const stored = await commitsRepo.get(commit.id);
    expect(stored?.linkedTaskIds).toEqual([task.id]);
  });

  it("keeps several tasks on one commit", async () => {
    const a = await seedTask("A");
    const b = await seedTask("B");
    const { commit } = await recordLocalCommit({
      projectId, root: "C:\\proj", sha: "c".repeat(40), message: "feat: z",
      author: "Dev", date: "2026-10-16T20:00:00Z", files: [], additions: 0, deletions: 0,
    });
    await linkCommitToTask({ projectId, commitId: commit.id, taskId: a.id });
    await linkCommitToTask({ projectId, commitId: commit.id, taskId: b.id });
    expect((await commitsRepo.get(commit.id))?.linkedTaskIds.sort()).toEqual([a.id, b.id].sort());
  });
});

describe("db.links stays usable for backlinks (P5 computeBacklinks)", () => {
  beforeEach(async () => {
    await freshDb(["commits", "links", "devLogs", "tasks"]);
  });
  it("a task's incoming links include the commit", async () => {
    const task = await seedTask("T");
    const { commit } = await recordLocalCommit({
      projectId, root: "C:\\proj", sha: "d".repeat(40), message: "feat: w",
      author: "Dev", date: "2026-10-16T20:00:00Z", files: [], additions: 0, deletions: 0,
    });
    await linkCommitToTask({ projectId, commitId: commit.id, taskId: task.id });
    const backlinks = await linksRepo.listByTarget("task", task.id);
    expect(backlinks.map((l) => l.sourceId)).toEqual([commit.id]);
    expect(await db.links.count()).toBe(1);
  });
});
