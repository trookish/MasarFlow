import { test, expect } from "@playwright/test";

/**
 * P10.T4: the first-run setup wizard, browser mode.
 *
 * In a plain browser the wizard is never shown on its own (shouldShowWizard()
 * returns false without the desktop bridge), so this spec exercises the
 * `?setup=1` force path — the same path the Control Center's "run setup again"
 * button uses, and the packaged spec will reuse. The bare first-run dialog
 * that tests/e2e/backup.spec.ts relies on is asserted to stay gone while the
 * wizard is up: the two must never show at the same time.
 */
test("/dashboard: first-run setup wizard", async ({ page }) => {
  await page.goto("/dashboard?setup=1", { waitUntil: "domcontentloaded" });
  const wizard = page.getByRole("dialog", { name: "Set up MasarFlow" });
  await wizard.waitFor({ state: "visible", timeout: 20_000 });

  // 1. welcome: the local-first promise is on screen, Continue is the only way on,
  //    and the bare first-run dialog is not open underneath.
  await expect(wizard.getByText("stays on this computer")).toBeVisible();
  await expect(wizard.getByRole("button", { name: /^Skip$/ })).toHaveCount(0);
  await expect(page.getByPlaceholder("Project name")).toHaveCount(0);

  // 2. project: Continue is blocked until a project exists.
  await wizard.getByRole("button", { name: /^Continue$/ }).click();
  await expect(wizard.getByRole("button", { name: /^Continue$/ })).toBeDisabled();
  await wizard.getByRole("button", { name: /Create a project/ }).click();
  const projectDialog = page.getByRole("dialog").filter({ has: page.getByPlaceholder("Project name") });
  await projectDialog.getByPlaceholder("Project name").fill("Wizard Project");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(wizard.getByText("Project ready.")).toBeVisible();

  // 3. folder step is skippable (linking needs the native picker).
  await wizard.getByRole("button", { name: /^Continue$/ }).click();
  await expect(wizard.getByText(/Link the folder on this computer/)).toBeVisible();
  await expect(wizard.getByRole("button", { name: /^Skip$/ })).toBeVisible();
  await wizard.getByRole("button", { name: /^Skip$/ }).click();

  // 4. provider step: the no-key path must exist (the app is usable before any key exists).
  await expect(wizard.getByText(/Choose an AI provider/)).toBeVisible();
  await expect(wizard.getByRole("button", { name: /No key needed yet/ })).toBeVisible();
  await wizard.getByRole("button", { name: /^Skip$/ }).click(); // provider -> migrate

  // 5. migrate step: skipping it is a first-class path.
  await expect(wizard.getByText(/Coming from an older MasarFlow/)).toBeVisible();
  await wizard.getByRole("button", { name: /^Skip$/ }).click(); // migrate -> finish

  // 6. finish: the wizard closes, and it does not come back.
  await expect(wizard.getByText(/You're set/)).toBeVisible();
  await wizard.getByRole("button", { name: /Close|Start using MasarFlow/ }).click();
  await expect(wizard).toHaveCount(0);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("dialog", { name: "Set up MasarFlow" })).toHaveCount(0);
  // A project exists now, so the bare first-run dialog must not appear either.
  await expect(page.getByPlaceholder("Project name")).toHaveCount(0);
});
