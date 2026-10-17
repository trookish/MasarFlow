import { tasksRepo } from "@/lib/db/repos/tasks";
import type { Task } from "@/lib/db/schema";
import type { GithubIssue } from "@/lib/server/github/client";

/**
 * Two-way issue ⇄ task sync.
 *
 * Pulling is safe and idempotent: an open issue with no task creates one, a
 * closed issue marks its task done, and a task whose issue is absent from the
 * fetched page is only *reported* (never deleted — losing local work to a
 * paginated API response would be unforgivable).
 *
 * Pushing is deliberately manual: closing a GitHub issue is a per-row button in
 * the panel, never a side effect of a local status change.
 */

export const ISSUE_TASK_TAG = "github";

export interface ExternalIssueRef {
  owner: string;
  repo: string;
  number: number;
}

/** "github:owner/repo#42" — stable, human-readable, and greppable in the DB. */
export function makeExternalRef(ref: ExternalIssueRef): string {
  return `github:${ref.owner}/${ref.repo}#${ref.number}`;
}

const REF_RE = /^github:([^/\s#]+)\/([^/\s#]+)#(\d+)$/;

export function parseExternalRef(value: string): ExternalIssueRef | null {
  const m = REF_RE.exec((value ?? "").trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

export interface IssueSyncPlan {
  createTasks: Array<{ issue: GithubIssue; title: string; externalRef: string; labels: string[] }>;
  closeTasks: Array<{ taskId: string; number: number }>;
  unchanged: number;
  /** Task refs whose issue was not in the fetched page — informational only. */
  orphanRefs: string[];
}

/**
 * Pure: decide what a sync would do. `repo` is passed in (never guessed from
 * the task refs) so the comparison is against one known repository.
 */
export interface SyncRepo {
  owner: string;
  repo: string;
}

export function planIssueTaskSync(
  tasks: Array<Pick<Task, "id" | "externalRef">>,
  issues: GithubIssue[],
  repo: SyncRepo,
): IssueSyncPlan {
  const byNumber = new Map<number, Pick<Task, "id" | "externalRef">>();
  for (const task of tasks) {
    const parsed = parseExternalRef(task.externalRef ?? "");
    if (parsed && parsed.owner === repo.owner && parsed.repo === repo.repo) {
      byNumber.set(parsed.number, task);
    }
  }

  const plan: IssueSyncPlan = { createTasks: [], closeTasks: [], unchanged: 0, orphanRefs: [] };
  const seen = new Set<number>();

  for (const issue of issues) {
    if (issue.isPullRequest) continue;
    const task = byNumber.get(issue.number);
    if (!task) {
      plan.createTasks.push({
        issue,
        title: issue.title,
        externalRef: makeExternalRef({ ...repo, number: issue.number }),
        labels: issue.labels,
      });
      continue;
    }
    seen.add(issue.number);
    if (issue.state === "closed") plan.closeTasks.push({ taskId: task.id, number: issue.number });
    else plan.unchanged++;
  }

  for (const [number, task] of byNumber) {
    if (!seen.has(number)) plan.orphanRefs.push(task.externalRef ?? `#${number}`);
  }
  return plan;
}

export interface IssueSyncResult {
  created: number;
  closed: number;
  unchanged: number;
  orphanRefs: string[];
}

/** Executes a plan against Dexie. Safe to run twice. */
export async function applyIssueTaskSync(
  projectId: string,
  plan: IssueSyncPlan,
  repo: SyncRepo,
): Promise<IssueSyncResult> {
  let created = 0;
  let closed = 0;

  for (const item of plan.createTasks) {
    const tags = Array.from(new Set([...item.labels, ISSUE_TASK_TAG]));
    await tasksRepo.create({
      projectId,
      title: item.title,
      description: item.issue.body,
      status: "backlog",
      priority: "medium",
      tags,
      /* The plan already stamps the ref; recomputing from the sync's own repo
         is the fallback so a task can never lose its issue identity. */
      externalRef: item.externalRef || makeExternalRef({ ...repo, number: item.issue.number }),
    });
    created++;
  }

  for (const item of plan.closeTasks) {
    await tasksRepo.update(item.taskId, { status: "done", progress: 100 });
    closed++;
  }

  return { created, closed, unchanged: plan.unchanged, orphanRefs: plan.orphanRefs };
}

/** Tasks already linked to the given repository (for the panel's counters). */
export async function listIssueLinkedTasks(projectId: string, repo: SyncRepo): Promise<Task[]> {
  const tasks = await tasksRepo.listByProject(projectId);
  return tasks.filter((task) => {
    const parsed = parseExternalRef(task.externalRef ?? "");
    return Boolean(parsed && parsed.owner === repo.owner && parsed.repo === repo.repo);
  });
}
