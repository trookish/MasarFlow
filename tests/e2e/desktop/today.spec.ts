/**
 * P9.T18 — matrix sweep for /today on the PACKAGED app (2 titles).
 *
 * The demo fixture (Pulse) is the local database these tests group from: it has
 * in-progress, in-review, high-priority-todo and medium-todo tasks, so the
 * Today buckets are non-trivial without seeding anything by hand.
 *
 * "Overdue" cannot be seeded through any user path (the only due-date control
 * in the app sets *today*), so this spec asserts its honest empty state and
 * proves the due-today grouping by moving a task with the real row button.
 */
import { test as base } from "@playwright/test";
import { expect, launchApp, navigateTo, readTable, type AppHandle } from "./_harness";

const GROUPS_TITLE =
  "/today: TODAY view groups overdue, due today, in progress and up next from the local database";
const DAILY_TITLE = "/today: TODAY opens (creating once) the daily note and focuses it in the dock";

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

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: number | null;
}

function localDay(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test(GROUPS_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Today");
  await expect(page.getByRole("heading", { name: /^Today — / })).toBeVisible({ timeout: 20_000 });

  const overdue = page.getByRole("region", { name: "Overdue" });
  const dueToday = page.getByRole("region", { name: "Due today" });
  const inProgress = page.getByRole("region", { name: "In progress" });
  const upNext = page.getByRole("region", { name: "Up next" });

  // Overdue: no user path can create one, so the bucket is honestly empty.
  await expect(overdue.getByText("Nothing is late.")).toBeVisible();

  // In progress: in_progress AND review both land here (the demo fixture has one of each).
  // `exact` matters: each row also owns a "Set the deadline of … to today"
  // button whose accessible name contains the title.
  await expect(
    inProgress.getByRole("button", { name: "Per-channel backpressure + stale state", exact: true }),
  ).toBeVisible();
  await expect(
    inProgress.getByRole("button", { name: "Event schema registry", exact: true }),
  ).toBeVisible();
  await expect(inProgress.getByText("In review counts as in progress.")).toBeVisible();

  // Up next: high-priority todos only — medium todos and backlog stay off the page.
  await expect(
    upNext.getByRole("button", { name: "Presence cursors on the board", exact: true }),
  ).toBeVisible();
  await expect(
    upNext.getByRole("button", { name: "Outbox replay on reconnect", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Beta onboarding checklist", exact: true })).toHaveCount(0);

  // Move the up-next task to today with its own row control: it must re-group.
  await upNext.getByRole("button", { name: "Set the deadline of Presence cursors on the board to today" }).click();
  await expect(
    dueToday.getByRole("button", { name: "Presence cursors on the board", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    upNext.getByRole("button", { name: "Presence cursors on the board", exact: true }),
  ).toHaveCount(0);
  await expect(dueToday.getByText(`Due ${localDay(Date.now())}`)).toBeVisible();
  await expect(page.getByText(/^0 overdue, 1 due today\.$/)).toBeVisible();

  // The grouping comes from the database: the row really carries today's date.
  const tasks = await readTable<TaskRow>(page, "tasks");
  const moved = tasks.find((t) => t.title === "Presence cursors on the board");
  expect(moved?.dueDate).not.toBeNull();
  expect(localDay(moved!.dueDate!)).toBe(localDay(Date.now()));
  // ...and nothing in the fixture is overdue, which is why that bucket is empty.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  expect(tasks.filter((t) => t.dueDate !== null && t.dueDate < startOfToday.getTime())).toHaveLength(0);
});

test(DAILY_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Today");
  const openButton = page.getByRole("button", { name: "Open today's note" });
  await expect(openButton).toBeVisible({ timeout: 20_000 });

  await openButton.click();
  const day = localDay(Date.now());
  // Several panels are docked; the daily note opens in the /brain panel.
  // `data-dock-url` holds the bare route (the ?note= selection lives in the
  // dock's per-panel params and mirrors into the URL while it is focused),
  // and opening the note twice must never produce a second brain panel.
  const focused = page.locator('[data-testid="dock-panel"][data-dock-url="/brain"]');
  await expect(focused).toHaveCount(1, { timeout: 20_000 });
  await expect.poll(() => page.url(), { timeout: 20_000 }).toContain("/brain?note=");
  const firstUrl = page.url();

  // The dock really shows the note, and the note is the day's.
  await expect(focused.locator('input[placeholder="Untitled note"]')).toHaveValue(day, { timeout: 20_000 });
  const notesAfterFirst = (await readTable<{ id: string; title: string; tags: string[] }>(page, "notes")).filter(
    (n) => n.title === day,
  );
  expect(notesAfterFirst).toHaveLength(1);
  expect(notesAfterFirst[0].tags).toContain("daily");
  expect(new URL(firstUrl).searchParams.get("note")).toBe(notesAfterFirst[0].id);

  // Clicking again must not create a second note, and must focus the same one.
  await navigateTo(page, "Today");
  await openButton.click();
  await expect(focused).toHaveCount(1);
  await expect.poll(() => new URL(page.url()).searchParams.get("note")).toBe(notesAfterFirst[0].id);
  const notesAfterSecond = (await readTable<{ id: string; title: string }>(page, "notes")).filter((n) => n.title === day);
  expect(notesAfterSecond).toHaveLength(1);
  expect(notesAfterSecond[0].id).toBe(notesAfterFirst[0].id);
});
