import { test as base, expect } from "@playwright/test";
import { launchApp, removeProfile, type AppHandle } from "./_harness";

// The 0.3 default shell: six surfaces, legacy routes redirected, Studio available as an opt-in.
const test = base.extend<{ desktop: AppHandle }>({
  desktop: async ({}, provide, testInfo) => {
    const handle = await launchApp({ seed: "demo", layout: "standard" });
    await provide(handle);
    await handle.close();
    if (testInfo.status === "passed") removeProfile(handle.profileDir);
  },
});

const SURFACES = ["Today", "Capture", "Work", "Library", "Ask", "System"];

async function openSurface(page: AppHandle["page"], label: string) {
  await page.getByRole("navigation", { name: "Surfaces" }).getByRole("link", { name: label, exact: true }).click();
}

test("/today: six surfaces in the sidebar", async ({ desktop }) => {
  const { page } = desktop;
  const nav = page.getByRole("navigation", { name: "Surfaces" });
  await expect(nav.getByRole("link")).toHaveText(SURFACES);
  await openSurface(page, "Today");
  await expect(page.locator('[data-surface="today"]')).toBeVisible({ timeout: 20_000 });
  await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
});

async function switchSection(page: AppHandle["page"], route: string, label: string, section: string, tab: string) {
  await openSurface(page, label);
  const surface = page.locator(`[data-surface="${route.slice(1)}"]`);
  await expect(surface).toBeVisible({ timeout: 20_000 });
  await surface.getByRole("tab", { name: tab, exact: true }).click();
  await expect(surface).toHaveAttribute("data-section", section, { timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`${route}\\?view=${section}`));
  await expect(surface.locator("[data-surface-section]")).not.toBeEmpty();
}

test("/capture: surface sections switch the hosted page", async ({ desktop }) => {
  await switchSection(desktop.page, "/capture", "Capture", "canvas", "Canvas");
});

test("/work: surface sections switch the hosted page", async ({ desktop }) => {
  await switchSection(desktop.page, "/work", "Work", "specs", "Specifications");
});

test("/library: surface sections switch the hosted page", async ({ desktop }) => {
  await switchSection(desktop.page, "/library", "Library", "standards", "Standards");
});

test("/ask: surface sections switch the hosted page", async ({ desktop }) => {
  await switchSection(desktop.page, "/ask", "Ask", "agents", "AI Agents");
});

test("/system: surface sections switch the hosted page", async ({ desktop }) => {
  await switchSection(desktop.page, "/system", "System", "git", "Git");
});

test("/work: legacy route redirects to its surface section", async ({ desktop }) => {
  const { page } = desktop;
  await openSurface(page, "Work");
  await expect(page.locator('[data-surface="work"]')).toBeVisible({ timeout: 20_000 });
  // The packaged app serves a custom protocol, so navigate from inside the page.
  await page.evaluate(() => window.location.assign("/specs"));
  await expect(page).toHaveURL(/\/work\?view=specs$/, { timeout: 30_000 });
  await expect(page.locator('[data-surface="work"]')).toHaveAttribute("data-section", "specs");
  await page.evaluate(() => window.location.assign("/brain/graph"));
  await expect(page).toHaveURL(/\/library\?view=graph$/, { timeout: 30_000 });
});

test("/settings: switch between the standard and Studio layouts", async ({ desktop }) => {
  const { page } = desktop;
  await openSurface(page, "System");
  const surface = page.locator('[data-surface="system"]');
  await expect(surface).toHaveAttribute("data-section", "settings", { timeout: 20_000 });
  await page.getByRole("button", { name: "Interface", exact: true }).first().click();
  await page.getByRole("radio", { name: "Studio" }).or(page.getByRole("button", { name: "Studio", exact: true })).first().click();
  await expect(page.locator('[data-layout="studio"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-dock-workspace]")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("navigation", { name: "Surfaces" })).toHaveCount(0);
  // The choice survives a restart of the renderer.
  await page.reload();
  await expect(page.locator('[data-layout="studio"]')).toBeVisible({ timeout: 60_000 });
});
