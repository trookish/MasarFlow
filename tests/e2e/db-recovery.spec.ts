import { test, expect } from "@playwright/test";

/**
 * P4.T6: the database health gate. A first visit creates the database at the
 * current schema version; the reload then pins indexedDB.open("masarflow") to
 * version 1 — a VersionError — and the recovery screen must replace the
 * workspace instead of crashing the shell.
 */
test("/dashboard: a corrupt database shows the recovery screen", async ({ page }) => {
  // First visit: create the database at the current schema version.
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /command palette/i })).toBeVisible({ timeout: 30_000 });

  // Reload with the version pinned to 1, so opening the v11 database fails.
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((name: string, v?: number) => (name === "masarflow" ? open(name, 1) : open(name, v))) as unknown as typeof indexedDB.open;
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const alert = page.getByRole("alert").filter({ hasText: "could not be opened" });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
