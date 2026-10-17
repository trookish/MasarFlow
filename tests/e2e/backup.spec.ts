import { test, expect, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * P4.T3: the Settings backup card, end to end. Export the whole workspace to a
 * file, wipe it with "Reset all data", then bring it back by importing the file.
 */

const PROJECT = "Backup Proof";

/** The project switcher trigger in the topbar shows the active project's name. */
const switcher = (page: Page) => page.locator('header button:has(span[class*="max-w-[10rem]"])');

/** A fresh browser context has no projects — the first-run prompt creates one. */
async function createProject(page: Page, name: string): Promise<void> {
  const field = page.getByPlaceholder("Project name");
  await field.waitFor({ state: "visible", timeout: 20_000 });
  await field.fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(switcher(page)).toContainText(name);
}

async function openDataSettings(page: Page): Promise<void> {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Data", exact: true }).click();
}

test("/settings: export then import restores the workspace", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await createProject(page, PROJECT);

  // Export: the downloaded file carries every table.
  await openDataSettings(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export backup" }).click(),
  ]);
  const file = join(mkdtempSync(join(tmpdir(), "masarflow-backup-")), "backup.json");
  await download.saveAs(file);
  const exported = JSON.parse(readFileSync(file, "utf8")) as { tables: Record<string, unknown[]> };
  expect(exported.tables.projects.some((p) => (p as { name?: string }).name === PROJECT)).toBe(true);
  await expect(page.getByText(/Backup exported \(\d+ records\)/)).toBeVisible();

  // Reset: everything is wiped and the first-run prompt returns. The prompt may
  // fall back to the default project on its own (its backdrop swallows a stray
  // click), so dismiss it if it is there and assert the fallback either way.
  await page.getByRole("button", { name: "Reset all data" }).click();
  await page.getByRole("button", { name: "Reset everything" }).click();
  const skip = page.getByRole("button", { name: "Start with My Project" });
  await skip.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  await skip.click({ timeout: 3_000 }).catch(() => undefined);
  await page.keyboard.press("Escape");
  await expect(switcher(page)).toContainText("My Project");

  // Import: choose the exported file in the hidden input, then replace.
  await openDataSettings(page);
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(/records, created/)).toBeVisible();
  await page.getByRole("button", { name: "Replace workspace" }).click();
  await expect(page.getByText(/Workspace restored \(\d+ records\)/)).toBeVisible();

  // The project is back: it is listed in the switcher and can be made active.
  await switcher(page).click();
  await page.getByRole("button", { name: PROJECT, exact: true }).click();
  await expect(switcher(page)).toContainText(PROJECT);
});
