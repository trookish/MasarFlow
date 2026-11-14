/**
 * v0.3 P6 on the PACKAGED app: one task model, note promotion, and the Today inbox.
 * Every step goes through the visible interface; readTable confirms what was stored.
 */
import { test as base } from "@playwright/test";
import {
  expect,
  launchApp,
  navigateTo,
  readTable,
  surfacePanel,
  type AppHandle,
} from "./_harness";

const MODEL_TITLE = "/tasks: status drives progress and the detail sets a due date";
const PROMOTE_TITLE = "/brain: promote a note to a task and keep the link";
const INBOX_TITLE = "/today: inbox lists unfiled notes and turns one into a task";

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

function panel(page: AppHandle["page"], route: string) {
  // Routes here are section routes (/tasks, /specs, /brain …), which now live
  // inside a surface; surfacePanel maps them to the hosting tab.
  return surfacePanel(page, route);
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  progress: number;
  dueDate: number | null;
}

test(MODEL_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Task Boards");
  const tasks = panel(page, "/tasks");
  const title = `P6 model ${Date.now()}`;
  await tasks.getByRole("button", { name: "New task" }).first().click();
  const titleInput = page.getByPlaceholder("Task title");
  await expect(titleInput).toHaveValue("New task", { timeout: 15_000 });
  await titleInput.fill(title);
  await page.keyboard.press("Tab");

  const dialog = page.getByTestId("task-editor");
  // Progress is read-only and follows status: no slider any more.
  await expect(dialog.locator('input[type="range"]')).toHaveCount(0);
  await expect(dialog.getByRole("progressbar", { name: "Task progress" })).toHaveAttribute("aria-valuenow", "0");

  await page.getByRole("button", { name: "To do", exact: true }).click();
  await page.getByRole("menuitem", { name: "In progress", exact: true }).click();
  await expect(dialog.getByRole("progressbar", { name: "Task progress" })).toHaveAttribute("aria-valuenow", "50", {
    timeout: 15_000,
  });

  // Assignee offers a person or the AI, never internal agent roles.
  await dialog.getByRole("button", { name: /^(Me|AI)$/ }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Me", "AI"]);
  await page.getByRole("menuitem", { name: "AI", exact: true }).click();

  await dialog.getByTestId("task-due-date").fill("2031-03-14");
  await expect(dialog.getByRole("button", { name: "Clear due date" })).toBeVisible({ timeout: 15_000 });

  // Folder-sync properties live under Advanced.
  await expect(dialog.getByPlaceholder("github:owner/repo#42")).toHaveCount(0);
  await dialog.getByRole("button", { name: /Advanced/ }).click();
  await expect(dialog.getByPlaceholder("github:owner/repo#42")).toBeVisible();

  await expect
    .poll(async () => (await readTable<TaskRow>(page, "tasks")).find((t) => t.title === title), { timeout: 15_000 })
    .toMatchObject({ status: "in_progress", progress: 50, assignee: "ai" });
  const saved = (await readTable<TaskRow>(page, "tasks")).find((t) => t.title === title)!;
  const due = new Date(saved.dueDate!);
  expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2031, 2, 14]);

  // The app is shared across this file's tests: leave no task open in the Inspector.
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("task-editor")).toHaveCount(0);
});

test(PROMOTE_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Brain");
  const brain = panel(page, "/brain");
  const title = `P6 promote ${Date.now()}`;
  await brain.getByRole("button", { name: "New note" }).first().click();
  const titleInput = brain.getByPlaceholder("Untitled note");
  await expect(titleInput).toHaveValue("Untitled note", { timeout: 15_000 });
  await titleInput.fill(title);
  await expect(brain.locator("button", { hasText: title }).first()).toBeVisible({ timeout: 15_000 });

  await brain.getByTestId("note-promote").click();
  await page.getByRole("menuitem", { name: "To task" }).click();
  await expect.poll(() => page.url(), { timeout: 20_000 }).toContain("/work");
  await expect.poll(() => new URL(page.url()).searchParams.get("task"), { timeout: 20_000 }).toBeTruthy();
  // The new task opens in the Inspector, titled after the note.
  await expect(page.getByPlaceholder("Task title")).toHaveValue(title, { timeout: 15_000 });
  await page.getByTestId("task-editor").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("task-editor")).toHaveCount(0);

  const task = (await readTable<TaskRow>(page, "tasks")).find((t) => t.title === title);
  expect(task).toBeTruthy();
  const note = (await readTable<{ id: string; title: string }>(page, "notes")).find((n) => n.title === title)!;
  const links = await readTable<{ sourceId: string; targetId: string; targetType: string; linkType: string }>(
    page,
    "links",
  );
  expect(links.filter((l) => l.sourceId === note.id)).toEqual([
    expect.objectContaining({ targetType: "task", targetId: task!.id, linkType: "relates" }),
  ]);
});

test(INBOX_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Brain");
  const brain = panel(page, "/brain");
  const title = `P6 inbox ${Date.now()}`;
  await brain.getByRole("button", { name: "New note" }).first().click();
  const titleInput = brain.getByPlaceholder("Untitled note");
  await expect(titleInput).toHaveValue("Untitled note", { timeout: 15_000 });
  await titleInput.fill(title);
  await expect(brain.locator("button", { hasText: title }).first()).toBeVisible({ timeout: 15_000 });

  await navigateTo(page, "Today");
  const inbox = page.getByRole("region", { name: "Inbox" });
  const row = inbox.getByTestId("today-inbox-item").filter({ hasText: title });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "Make task" }).click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });
  expect((await readTable<TaskRow>(page, "tasks")).filter((t) => t.title === title)).toHaveLength(1);
});
