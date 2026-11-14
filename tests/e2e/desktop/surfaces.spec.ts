import { test as base, expect } from "@playwright/test";
import { launchApp, removeProfile, type AppHandle } from "./_harness";

// The 0.2 shell: six surfaces, legacy routes redirected into their surface section.
const test = base.extend<{ desktop: AppHandle }>({
  desktop: async ({}, provide, testInfo) => {
    const handle = await launchApp({ seed: "demo" });
    await provide(handle);
    await handle.close();
    if (testInfo.status === "passed") removeProfile(handle.profileDir);
  },
});

const SURFACES = ["Today", "Capture", "Work", "Library", "AI", "System"];

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

test("/ai: surface sections switch the hosted page", async ({ desktop }) => {
  await switchSection(desktop.page, "/ai", "AI", "agents", "Agents");
});

test("/ai: the renamed /ask address opens the AI surface on the same section", async ({ desktop }) => {
  const { page } = desktop;
  await openSurface(page, "Work");
  await expect(page.locator('[data-surface="work"]')).toBeVisible({ timeout: 20_000 });
  // A bookmark or stored tab from before the rename keeps working and keeps its section.
  await page.evaluate(() => window.location.assign(new URL("/ask?view=agents", window.location.href).href));
  await expect(page).toHaveURL(/\/ai\?view=agents$/, { timeout: 30_000 });
  const surface = page.locator('[data-surface="ai"]');
  await expect(surface).toHaveAttribute("data-section", "agents", { timeout: 30_000 });
  await expect(surface.getByRole("tab", { name: "Agents", exact: true })).toHaveAttribute("aria-selected", "true");
  // The sidebar names the surface once, with the new label; no tab is left behind under the old route.
  await expect(page.getByRole("navigation", { name: "Surfaces" }).getByRole("link", { name: "AI", exact: true })).toBeVisible();
  await expect(page.locator('[data-dock-tab][data-dock-url^="/ask"]')).toHaveCount(0);
});

test("/system: surface sections switch the hosted page", async ({ desktop }) => {
  await switchSection(desktop.page, "/system", "System", "git", "Git");
});

test("/work: legacy route redirects to its surface section", async ({ desktop }) => {
  const { page } = desktop;
  await openSurface(page, "Work");
  await expect(page.locator('[data-surface="work"]')).toBeVisible({ timeout: 20_000 });
  // The packaged app serves a custom protocol, so navigate from inside the page.
  await page.evaluate(() => window.location.assign(new URL("/specs", window.location.href).href));
  await expect(page).toHaveURL(/\/work\?view=specs$/, { timeout: 30_000 });
  await expect(page.locator('[data-surface="work"]')).toHaveAttribute("data-section", "specs");
  await page.evaluate(() => window.location.assign(new URL("/brain/graph", window.location.href).href));
  await expect(page).toHaveURL(/\/library\?view=graph$/, { timeout: 30_000 });
});
