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
