/**
 * P9.T9 — matrix sweep for the planning routes on the PACKAGED app:
 * /specs, /sprints, /standards, /tasks, /devlogs, /workflow — plus the
 * dashboard's creation actions, which deep-link into /specs and /tasks.
 *
 * The demo fixture (Pulse) is the local database these tests read from:
 * - four tasks across todo/in_progress/review, one spec (RFC-001) linked to
 *   two notes and a task, one sprint, one standard, three dev logs;
 * - one 16-step workflow run ("Live presence — idea to implementation") with
 *   3 steps done and the 4th running.
 * Every assertion drives the product UI or reads what the app itself
 * persisted (readTable) — nothing is seeded by hand.
 *
 * NOTE on `/workflow: automation rules render`: the title is the one the P9
 * plan puts in the matrix (…-p9-truth.md:1138). /workflow ships the 16-step
 * idea→implementation pipeline, not an "automation rules" list — the body
 * below therefore asserts the pipeline it really renders (run sidebar, step
 * list, per-step status), which is what the plan's feature name covers.
 *
 * One app per worker (like today.spec.ts), reused by every test in the file.
 */
import { test as base } from "@playwright/test";
import {
  expect,
  launchApp,
  navigateTo,
  readTable,
  type AppHandle,
} from "./_harness";

const test = base.extend<object, { desktop: AppHandle }>({
  desktop: [
    async ({}, provide) => {
      const handle = await launchApp({ seed: "demo" });
      await provide(handle);
      await handle.close();
    },
    { scope: "worker" },
  ],
});

const TASK_CREATE_TITLE = "/tasks: create a task on the board";
const TASK_DONE_TITLE = "/tasks: task done writes a dev log";
const SPRINT_TITLE = "/sprints: create a sprint";
const SPEC_TITLE = "/specs: create a spec";
const STANDARD_TITLE = "/standards: create a standard";
const DEVLOGS_TITLE = "/devlogs: seeded entries are listed";
const WORKFLOW_TITLE = "/workflow: automation rules render";
const DASHBOARD_TITLE = "/dashboard: New spec and New task open the create flow";

function panel(page: import("@playwright/test").Page, prefix: string) {
  return page.locator(`[data-testid="dock-panel"][data-dock-url^="${prefix}"]`);
}

test(TASK_CREATE_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Task Boards");
  const tasks = panel(page, "/tasks");
  await expect(tasks.getByRole("heading", { name: "Task Boards" })).toBeVisible({
    timeout: 20_000,
  });

  const title = `P9 task ${Date.now()}`;
  await tasks.getByRole("button", { name: "New task" }).first().click();
  const titleInput = page.getByPlaceholder("Task title");
  await expect(titleInput).toHaveValue("New task", { timeout: 15_000 });
  await titleInput.fill(title);
  await page.keyboard.press("Tab"); // blur saves the title
  await expect(titleInput).toHaveValue(title);

  // Close the detail dialog (it portals to <body>, so scope to the dialog):
  // the new card is on the board.
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(tasks.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 });
  const rows = await readTable<{ id: string; title: string; status: string }>(page, "tasks");
  const saved = rows.filter((t) => t.title === title);
  expect(saved).toHaveLength(1);
  expect(saved[0].status).toBe("todo");
});

test(TASK_DONE_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Task Boards");
  const tasks = panel(page, "/tasks");

  const title = `P9 done task ${Date.now()}`;
  await tasks.getByRole("button", { name: "New task" }).first().click();
  const titleInput = page.getByPlaceholder("Task title");
  await expect(titleInput).toHaveValue("New task", { timeout: 15_000 });
  await titleInput.fill(title);
  await page.keyboard.press("Tab");

  // Move it to done with the detail dialog's own status control (the dialog
  // portals to <body>, so these are page-scoped).
  await page.getByRole("button", { name: "To do", exact: true }).click();
  await page.getByRole("menuitem", { name: "Done", exact: true }).click();
  // The status trigger now reads "Done" — anchored via its menu semantics,
  // because the dialog's footer button is also named "Done".
  await expect(
    page.locator('[role="dialog"] button[aria-haspopup="menu"]', { hasText: /^Done$/ }),
  ).toBeVisible({ timeout: 15_000 });

  // Close the detail dialog: its full-screen backdrop swallows the dock
  // clicks the next step needs (the dialog portals to <body>, so the nav
  // behind it is unreachable while it is open).
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // P5: completing a task appends a dev log entry. Scope to the panel — the
  // dashboard's live "Recent activity" card shows the same entries, and its
  // hidden copy would win a page-wide .first().
  await navigateTo(page, "Dev Logs");
  const devlogs = panel(page, "/devlogs");
  await expect(devlogs.getByText(`Completed task "${title}"`).first()).toBeVisible({
    timeout: 20_000,
  });
  const logs = await readTable<{ title: string; type: string; refType: string }>(page, "devLogs");
  const entry = logs.find((l) => l.title === `Completed task "${title}"`);
  expect(entry).toBeTruthy();
  expect(entry!.type).toBe("task");
  expect(entry!.refType).toBe("task");
});

test(SPRINT_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Sprints");
  const sprints = panel(page, "/sprints");
  await expect(sprints.getByRole("button", { name: "New sprint" }).first()).toBeVisible({
    timeout: 20_000,
  });

  const name = `P9 sprint ${Date.now()}`;
  await sprints.getByRole("button", { name: "New sprint" }).first().click();
  const nameInput = sprints.getByPlaceholder("Sprint name");
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await nameInput.fill(name);
  await page.keyboard.press("Tab"); // blur saves the name

  await expect(sprints.getByText(name, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  const rows = await readTable<{ id: string; name: string }>(page, "sprints");
  expect(rows.filter((s) => s.name === name)).toHaveLength(1);
});

test(SPEC_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Specifications");
  const specs = panel(page, "/specs");
  await expect(specs.getByRole("button", { name: "New spec" }).first()).toBeVisible({
    timeout: 20_000,
  });

  const title = `P9 spec ${Date.now()}`;
  await specs.getByRole("button", { name: "New spec" }).first().click();
  const titleInput = specs.getByPlaceholder("Spec title");
  await expect(titleInput).toHaveValue("Untitled spec", { timeout: 15_000 });
  await titleInput.fill(title);

  // The editor autosaves (450 ms); the list is a live query over the database.
  await expect(specs.getByText(title, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  const rows = await readTable<{ id: string; title: string; number: string }>(page, "specs");
  const saved = rows.filter((s) => s.title === title);
  expect(saved).toHaveLength(1);
  expect(saved[0].number).toMatch(/^RFC-\d+$/);
});

test(STANDARD_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Standards");
  const standards = panel(page, "/standards");
  await expect(standards.getByRole("button", { name: "New standard" }).first()).toBeVisible({
    timeout: 20_000,
  });

  const title = `P9 standard ${Date.now()}`;
  await standards.getByRole("button", { name: "New standard" }).first().click();
  const titleInput = standards.getByPlaceholder("Standard title");
  await expect(titleInput).toBeVisible({ timeout: 15_000 });
  await titleInput.fill(title);

  await expect(standards.getByText(title, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  const rows = await readTable<{ id: string; title: string }>(page, "standards");
  expect(rows.filter((s) => s.title === title)).toHaveLength(1);
});

test(DEVLOGS_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Dev Logs");
  const devlogs = panel(page, "/devlogs");
  // The seeded entries are grouped from the local database (Pulse). Scope to
  // the panel: the dashboard's "Recent activity" card shows the same titles,
  // and its hidden copy wins a page-wide .first().
  await expect(devlogs.getByText(/SPEC-001 hit 55%/).first()).toBeVisible({ timeout: 20_000 });
  await expect(devlogs.getByText("Deploy webhooks live for beta").first()).toBeVisible();
  const logs = await readTable<{ title: string }>(page, "devLogs");
  expect(logs.some((l) => /SPEC-001 hit 55%/.test(l.title))).toBe(true);
});

test(WORKFLOW_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "AI Workflow");
  const workflow = panel(page, "/workflow");

  // The seeded run is in the sidebar; selecting it renders the 16-step
  // pipeline with its per-step statuses.
  const run = workflow.getByRole("button", { name: /Live presence/ }).first();
  await expect(run).toBeVisible({ timeout: 20_000 });
  await run.click();

  await expect(workflow.getByText("Live presence — idea to implementation").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(workflow.getByText("3/16")).toBeVisible();
  await expect(workflow.getByText("Clarify the idea")).toBeVisible();
  await expect(workflow.getByText("Rollout & next steps")).toBeVisible();
  await expect(workflow.getByText(/Live < 1s, calm at scale/)).toBeVisible();

  const runs = await readTable<{ id: string; title: string }>(page, "workflowRuns");
  const seeded = runs.find((r) => r.title === "Live presence — idea to implementation");
  expect(seeded).toBeTruthy();
  const steps = await readTable<{ runId: string; status: string }>(page, "workflowSteps");
  const runSteps = steps.filter((s) => s.runId === seeded!.id);
  expect(runSteps).toHaveLength(16);
  expect(runSteps.filter((s) => s.status === "done")).toHaveLength(3);
});

test(DASHBOARD_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  // Focus the target routes first: the action must work when the route is
  // already the focused panel, where a plain push to it changes nothing.
  await navigateTo(page, "Specifications");
  const specs = panel(page, "/specs");
  await expect(specs.getByRole("button", { name: "New spec" }).first()).toBeVisible({
    timeout: 20_000,
  });
  const specsBefore = (await readTable<{ id: string }>(page, "specs")).length;

  await navigateTo(page, "Dashboard");
  const dashboard = panel(page, "/dashboard");
  await dashboard.getByRole("button", { name: "New spec" }).first().click();

  // The specs panel is focused again, a spec was really created, and its
  // editor is open on the new spec.
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("/specs?spec=");
  await expect(specs.getByPlaceholder("Spec title")).toHaveValue("Untitled spec", {
    timeout: 15_000,
  });
  const specsAfter = await readTable<{ id: string }>(page, "specs");
  expect(specsAfter.length).toBe(specsBefore + 1);

  // Same contract for tasks: the board is already open, the action still
  // creates and opens a task.
  await navigateTo(page, "Task Boards");
  const tasks = panel(page, "/tasks");
  await expect(tasks.getByRole("heading", { name: "Task Boards" })).toBeVisible({
    timeout: 20_000,
  });
  const tasksBefore = (await readTable<{ id: string }>(page, "tasks")).length;

  await navigateTo(page, "Dashboard");
  await dashboard.getByRole("button", { name: "New task" }).first().click();

  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("/tasks?task=");
  await expect(page.getByPlaceholder("Task title")).toHaveValue("New task", {
    timeout: 15_000,
  });
  const tasksAfter = await readTable<{ id: string }>(page, "tasks");
  expect(tasksAfter.length).toBe(tasksBefore + 1);
});
