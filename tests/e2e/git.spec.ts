import { test, expect } from "@playwright/test";

/**
 * P6.T9: the /git route in browser mode. Every git operation is main-process
 * only (the preload exposes it as window.masarflow.git); a browser tab has no
 * bridge, so the route must render the "desktop required" panel instead of
 * crashing or silently showing an empty page.
 */
test("/git: browser mode explains git needs the desktop app", async ({ page }) => {
  await page.goto("/git", { waitUntil: "domcontentloaded" });

  // Pin the condition the panel handles: no Electron preload in a browser tab.
  expect(
    await page.evaluate(() => typeof (window as { masarflow?: unknown }).masarflow),
  ).toBe("undefined");

  // A fresh browser profile has no project, so the blocking first-run dialog
  // is open; dismissing it seeds the default project and reveals the shell.
  await page.getByRole("button", { name: "Start with My Project" }).click();

  await expect(
    page.getByRole("heading", { name: "Git needs the desktop app" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/the browser preview cannot run git/)).toBeVisible();

  // The nav entry exists under System (the group panel must be opened first —
  // the sidebar shows one group at a time and defaults to Capture).
  await page.getByRole("button", { name: "System" }).click();
  const gitLink = page.getByRole("link", { name: "Git" }).first();
  await expect(gitLink).toBeVisible();
  await expect(gitLink).toHaveAttribute("href", "/git");
});
