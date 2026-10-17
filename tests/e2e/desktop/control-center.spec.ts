import { test, expect, navigateTo } from "./_harness";

/**
 * The packaged dock is the bottom floating dock: nav links live in per-group
 * popups, so navigation goes through the harness's `navigateTo` (which handles
 * both rail and popup layouts) instead of a bare `getByRole("link")` click.
 */
test("/control-center: diagnostics and update panel", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Control Center");
  const cc = page.getByTestId("control-center");
  await expect(cc.getByRole("heading", { name: "Control Center" })).toBeVisible();
  // The header prints the real 4-part display version from the main process (D11);
  // the parenthesised part is app.getVersion(), which carries the -alpha prerelease.
  await expect(cc.getByText(/MasarFlow 0\.2\.0\.0 \(0\.2\.0/)).toBeVisible();

  // Overview: the local service answered on the app protocol
  await expect(cc.getByText(/Local service: ok/)).toBeVisible();

  // Every tab is scoped to the Control Center so the Settings dock panel's own
  // "Updates"/"Back up now" buttons can never collide with these.
  const tabs = cc.getByRole("navigation", { name: "Control Center sections" });

  // Folders: the allow-list viewer renders (empty on a fresh --user-data-dir profile)
  await tabs.getByRole("button", { name: "Folders" }).click();
  await expect(cc.getByText(/No folders linked yet/)).toBeVisible();

  // Secrets: presence only — never a value
  await tabs.getByRole("button", { name: "Secrets" }).click();
  await expect(cc.getByText(/never leave the OS credential store/)).toBeVisible();
  await expect(cc.getByText(/^GitHub token: (present|absent)$/)).toBeVisible();

  // Backups: the rolling-backup card and a manual backup button
  await tabs.getByRole("button", { name: "Backups" }).click();
  await expect(cc.getByRole("button", { name: "Back up now" }).first()).toBeVisible();
  await expect(cc.getByLabel("Automatic backups")).toBeVisible();

  // Logs: the redacted report is rendered and copyable, redaction rule #0 included
  await tabs.getByRole("button", { name: "Logs" }).click();
  const report = page.getByTestId("diagnostics-report");
  await expect(report).toHaveValue(/# MasarFlow diagnostics/);
  await expect(report).toHaveValue(/No API keys, tokens, PATs/);
  await expect(report).toHaveValue(/display version 0\.2\.0\.0/);

  // Updates: the panel is live and reports a main-process phase. A win-unpacked
  // run is a *packaged* build, so the phase can be any of these depending on
  // where the 15 s launch check is — assert the wiring, not one phase.
  await tabs.getByRole("button", { name: "Updates" }).click();
  await expect(cc.getByText(/Current version/)).toBeVisible();
  await expect(cc.getByRole("button", { name: /Check now/ })).toBeVisible();
  await expect(
    cc
      .getByText(
        /Not checked yet|Checking for updates|up to date|is available|Could not check for updates|Downloading|is ready|Development build|portable build cannot update itself/i,
      )
      .first(),
  ).toBeVisible();

  // And it is reachable from Settings too (no route without a caller — master §3 item 5)
  await navigateTo(page, "Settings");
  await page.getByRole("button", { name: "Data", exact: true }).first().click();
  await expect(page.getByText("Health, linked folders, stored secrets, backups, logs and updates in one place.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Control Center" })).toBeVisible();
});
