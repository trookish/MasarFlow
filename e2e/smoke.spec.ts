import { test, expect } from "@playwright/test";

test("redirects root to the dashboard and renders the shell", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard/);
  // Sidebar brand is present.
  await expect(page.getByText("MasarFlow")).toBeVisible();
});

test("navigates the sidebar without 404s", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  for (const path of ["/brain", "/specs", "/tasks", "/settings"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(path));
    // The app shell topbar search button is always rendered.
    await expect(
      page.getByRole("button", { name: /command palette/i }),
    ).toBeVisible();
  }
});

test("creates a note in the Brain module", async ({ page }) => {
  await page.goto("/brain", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New note" }).first().click();
  // The editor title input appears for the new note.
  await expect(page.getByPlaceholder("Untitled note")).toBeVisible();
});

test("creates a spec in the Specifications module", async ({ page }) => {
  await page.goto("/specs", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New spec" }).first().click();
  // The RFC editor opens with its title field.
  await expect(page.getByPlaceholder("Spec title")).toBeVisible();
});

test("creates a task on the kanban board", async ({ page }) => {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New task" }).first().click();
  // The task detail dialog opens with its title field.
  await expect(page.getByPlaceholder("Task title")).toBeVisible();
});

test("creates a standard and opens the enforcer", async ({ page }) => {
  await page.goto("/standards", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New standard" }).first().click();
  await expect(page.getByPlaceholder("Standard title")).toBeVisible();
  // The enforcer tab renders its scan summary.
  await page.getByRole("tab", { name: "Enforcer" }).click();
  await expect(page.getByText(/machine-checkable standard/i)).toBeVisible();
});

test("creates a system and views the architecture diagram", async ({
  page,
}) => {
  await page.goto("/architecture", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New system" }).first().click();
  await expect(page.getByPlaceholder("System name")).toBeVisible();
  // The Diagram tab renders the live dependency graph once a system exists.
  await page.getByRole("tab", { name: "Diagram" }).click();
  await expect(
    page.getByRole("button", { name: "Auto-arrange" }),
  ).toBeVisible();
});

test("creates a doc in the Documentation hub", async ({ page }) => {
  await page.goto("/docs", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New doc" }).first().click();
  // The doc editor opens with its title field.
  await expect(page.getByPlaceholder("Untitled doc")).toBeVisible();
});

test("adds an entry in the Dev Logs timeline", async ({ page }) => {
  await page.goto("/devlogs", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New entry" }).first().click();
  // The composer opens with its title field.
  await expect(page.getByPlaceholder("What happened?")).toBeVisible();
});

test("scans the workspace into the Sync Panel", async ({ page }) => {
  // Seed a note so the scan produces at least one vault file.
  await page.goto("/brain", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New note" }).first().click();
  await expect(page.getByPlaceholder("Untitled note")).toBeVisible();

  await page.goto("/sync", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Scan workspace" }).first().click();
  // A markdown vault file row appears for the note.
  await expect(page.getByText(/notes\/.*\.md/)).toBeVisible();
});

test("simulates a change in the Project Watcher", async ({ page }) => {
  await page.goto("/watcher", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Simulate change" }).first().click();
  // A file-change event row appears in the feed.
  await expect(
    page.getByText(/src\/|assets\/|scenes\/|shaders\/|config\/|docs\//).first(),
  ).toBeVisible();
});

test("filters the cross-entity knowledge graph", async ({ page }) => {
  // Seed one note so the graph has data and the filter toolbar renders.
  await page.goto("/brain", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New note" }).first().click();
  await expect(page.getByPlaceholder("Untitled note")).toBeVisible();

  await page.goto("/knowledge", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Systems" })).toBeVisible();
});
