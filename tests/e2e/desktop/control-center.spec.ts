import { test, expect } from "./_harness";
import type { Page } from "@playwright/test";

/**
 * Sidebar click, so the dock URL sync is exercised. The P9 harness (still in
 * flight this wave) has no `openRoute` helper yet; this mirrors what
 * `seedDemoProjects` does for Settings.
 */
async function openRoute(page: Page, name: string): Promise<void> {
  await page.getByRole("link", { name }).first().click();
}

test("/control-center: diagnostics and update panel", async ({ desktop }) => {
  const { page } = desktop;
  await openRoute(page, "Control Center");
  await expect(page.getByRole("heading", { name: "Control Center" })).toBeVisible();
  // The header prints the real 4-part display version from the main process (D11);
  // the parenthesised part is app.getVersion(), which carries the -alpha prerelease.
  await expect(page.getByText(/MasarFlow 0\.2\.0\.0 \(0\.2\.0/)).toBeVisible();

  // Overview: the local service answered on the app protocol
  await expect(page.getByText(/Local service: ok/)).toBeVisible();

  // Folders: the allow-list viewer renders (empty on a fresh --user-data-dir profile)
  await page.getByRole("button", { name: "Folders" }).click();
  await expect(page.getByText(/No folders linked yet/)).toBeVisible();

  // Secrets: presence only — never a value
  await page.getByRole("button", { name: "Secrets" }).click();
  await expect(page.getByText(/never leave the OS credential store/)).toBeVisible();
  await expect(page.getByText(/^GitHub token: (present|absent)$/)).toBeVisible();

  // Logs: the redacted report is rendered and copyable, redaction rule #0 included
  await page.getByRole("button", { name: "Logs" }).click();
  const report = page.getByRole("textbox");
  await expect(report).toHaveValue(/# MasarFlow diagnostics/);
  await expect(report).toHaveValue(/No API keys, tokens, PATs/);
  await expect(report).toHaveValue(/display version 0\.2\.0\.0/);

  // Updates: the panel is live (a win-unpacked run reports the dev reason, an installed build reports a version)
  await page.getByRole("button", { name: "Updates" }).click();
  await expect(page.getByRole("button", { name: /Check now/ })).toBeVisible();
  await expect(page.getByText(/Development build|portable build cannot update itself|Not checked yet|up to date/i)).toBeVisible();

  // And it is reachable from Settings too (no route without a caller — master §3 item 5)
  await openRoute(page, "Settings");
  await expect(page.getByText("Health, linked folders, stored secrets, backups, logs and updates in one place.")).toBeVisible();
});
