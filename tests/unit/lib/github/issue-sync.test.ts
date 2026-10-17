import { describe, it, expect, beforeEach } from "vitest";
import { freshDb } from "../../_helpers/db";
import { tasksRepo } from "@/lib/db/repos/tasks";
import {
  ISSUE_TASK_TAG,
  applyIssueTaskSync,
  makeExternalRef,
  parseExternalRef,
  planIssueTaskSync,
} from "@/lib/github/issue-sync";
import type { GithubIssue } from "@/lib/server/github/client";

const projectId = "p1";
/** The repository identity every sync is compared against — never inferred from the refs. */
const repo = { owner: "trookish", repo: "MasarFlow" };

const issue = (over: Partial<GithubIssue> = {}): GithubIssue => ({
  number: 7, title: "Panel flickers", body: "steps", state: "open",
  labels: ["bug"], htmlUrl: "https://github.com/o/r/issues/7",
  updatedAt: "2026-10-16T20:00:00Z", isPullRequest: false, ...over,
});

describe("externalRef helpers", () => {
  it("round-trips", () => {
    const ref = makeExternalRef({ owner: "trookish", repo: "MasarFlow", number: 42 });
    expect(ref).toBe("github:trookish/MasarFlow#42");
    expect(parseExternalRef(ref)).toEqual({ owner: "trookish", repo: "MasarFlow", number: 42 });
  });
  it("rejects anything else", () => {
    for (const bad of ["", "jira:ABC-1", "github:o/r", "github:o/r#x"]) {
      expect(parseExternalRef(bad), bad).toBeNull();
    }
  });
});

describe("planIssueTaskSync", () => {
  it("creates a task for an open issue with no task yet", () => {
    const plan = planIssueTaskSync([], [issue()], repo);
    expect(plan.createTasks).toHaveLength(1);
    expect(plan.createTasks[0]).toMatchObject({
      externalRef: "github:trookish/MasarFlow#7",
      title: "Panel flickers",
      labels: ["bug"],
    });
    expect(plan.closeTasks).toEqual([]);
  });
  it("leaves an already-linked task alone", () => {
    const plan = planIssueTaskSync(
      [{ id: "t1", externalRef: "github:trookish/MasarFlow#7" }],
      [issue()],
      repo,
    );
    expect(plan.createTasks).toEqual([]);
    expect(plan.closeTasks).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });
  it("ignores refs that belong to a different repository", () => {
    const plan = planIssueTaskSync(
      [{ id: "t1", externalRef: "github:other/repo#7" }],
      [issue()],
      repo,
    );
    expect(plan.createTasks).toHaveLength(1);
    expect(plan.orphanRefs).toEqual([]);
  });
  it("marks a task done when its issue is closed", () => {
    const plan = planIssueTaskSync(
      [{ id: "t1", externalRef: "github:trookish/MasarFlow#7" }],
      [issue({ state: "closed" })],
      repo,
    );
    expect(plan.closeTasks).toEqual([{ taskId: "t1", number: 7 }]);
  });
  it("reports refs whose issue was not in this page, without touching the task", () => {
    const plan = planIssueTaskSync([{ id: "t1", externalRef: "github:trookish/MasarFlow#999" }], [issue()], repo);
    expect(plan.orphanRefs).toEqual(["github:trookish/MasarFlow#999"]);
    expect(plan.closeTasks).toEqual([]);
  });
});

describe("applyIssueTaskSync", () => {
  beforeEach(async () => {
    await freshDb(["tasks", "links", "commits", "devLogs"]);
  });

  it("creates missing tasks, tags them, stores the ref and closes done ones", async () => {
    const existing = await tasksRepo.create({
      projectId, title: "Closed issue task", status: "todo",
      externalRef: "github:trookish/MasarFlow#8",
    });
    const plan = planIssueTaskSync(
      [{ id: existing.id, externalRef: existing.externalRef }],
      [issue(), issue({ number: 8, title: "Closed issue task", state: "closed" })],
      repo,
    );
    const result = await applyIssueTaskSync(projectId, plan, repo);

    expect(result.created).toBe(1);
    expect(result.closed).toBe(1);
    const tasks = await tasksRepo.listByProject(projectId);
    const created = tasks.find((t) => t.externalRef === "github:trookish/MasarFlow#7");
    expect(created).toMatchObject({ title: "Panel flickers", status: "backlog" });
    expect(created?.tags).toContain(ISSUE_TASK_TAG);
    expect(tasks.find((t) => t.id === existing.id)?.status).toBe("done");
  });

  it("is idempotent — a second run creates nothing", async () => {
    const first = await applyIssueTaskSync(projectId, planIssueTaskSync([], [issue()], repo), repo);
    const second = await applyIssueTaskSync(
      projectId,
      planIssueTaskSync(await tasksRepo.listByProject(projectId), [issue()], repo),
      repo,
    );
    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(await tasksRepo.listByProject(projectId)).toHaveLength(1);
  });
});
