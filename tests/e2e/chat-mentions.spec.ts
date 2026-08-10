import { test, expect } from "@playwright/test";

/**
 * The chat composer's `/ @ #` trigger menus. The demo project is loaded first
 * so there is a chat connection (no key needed for the UI) plus notes/specs/
 * tasks/etc. for the `#` records menu to surface.
 */

const MENU_HINT = /↵ insert/;

test("opens / commands, @ pages, and # records menus", async ({ page }) => {
  // The chat now runs on OpenCode — stub the backend so the composer renders
  // in its healthy state (the menus themselves are what this spec covers).
  await page.route("**/api/opencode/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, version: "1.18.15" }),
    }),
  );
  await page.route("**/api/opencode/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        providers: [
          {
            providerId: "fake",
            providerName: "Fake Provider",
            models: [
              {
                id: "fake-model",
                name: "Fake Model",
                capabilities: { reasoning: true, attachment: false, toolcall: true },
              },
            ],
          },
        ],
        cached: false,
      }),
    }),
  );
  await page.route("**/api/opencode/session*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        threadId: "t",
        opencodeSessionId: "ses_e2e_mentions",
        directory: "C:\\workspace",
        created: true,
      }),
    }),
  );

  // Seed the demo project (provides a chat connection + searchable records).
  await page.goto("/settings", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: /Load demo/i }).click();
  await page.waitForURL(/\/dashboard/);

  await page.goto("/chat", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New chat" }).first().click();

  // Composer textarea in its healthy state.
  const textarea = page.getByPlaceholder(/Ask about|Message the model/i);
  await expect(textarea).toBeVisible();

  // `/` → commands menu
  await textarea.click();
  await textarea.fill("/");
  const menu = page.getByText(MENU_HINT).locator("xpath=../..");
  await expect(page.getByText(MENU_HINT)).toBeVisible();
  await expect(menu.getByText("Commands")).toBeVisible();
  await expect(menu.getByRole("button", { name: "Create note" })).toBeVisible();

  // `@` → pages menu
  await textarea.fill("@");
  await expect(page.getByText(MENU_HINT)).toBeVisible();
  await expect(menu.getByText("Pages")).toBeVisible();
  // A known workspace page is offered (exact label to avoid href substring matches).
  await expect(menu.getByText("Documentation", { exact: true })).toBeVisible();

  // `#` → records menu (loads from the demo project's notes/specs/etc.)
  await textarea.fill("#");
  await expect(page.getByText(MENU_HINT)).toBeVisible();
  await expect(menu.getByText("Records")).toBeVisible();
  // Records finish loading and at least one item is offered.
  await expect(menu.getByText("Loading records…")).toHaveCount(0);
  await expect(menu.locator("button").first()).toBeVisible({
    timeout: 10_000,
  });
  const recordCount = await menu.locator("button").count();
  expect(recordCount).toBeGreaterThan(0);
});
