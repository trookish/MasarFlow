/**
 * P9.T18 — dock specs on the PACKAGED app.
 *
 *   /settings: the tiled-pane overlap fix (P9.T18) — a split track clips its
 *              panel body, so no panel's content paints into its neighbour
 *   /dashboard: split dividers resize with the keyboard and expose aria-valuenow
 *
 * The first test is the regression test for the reported bug: at 1280x720 the
 * Brain panel's own columns are wider than a 50/50 track, so the panel's
 * content used to paint past the divider (visible through the neighbouring
 * Settings pane's transparent nav, and unclickable there because the nav won
 * the hit test). Both titles live in tests/e2e/feature-matrix.json.
 */
import { test as base } from "@playwright/test";
import { expect, launchApp, navigateTo, type AppHandle } from "./_harness";

const OVERLAP_TITLE =
  "/settings: DOCK panes clip their content so a tiled split never bleeds into the neighbouring pane";
const DIVIDER_TITLE = "/dashboard: DOCK split dividers resize with the keyboard and expose aria-valuenow";

const test = base.extend<object, { desktop: AppHandle }>({
  desktop: [
    async ({}, provide) => {
      const handle = await launchApp({ seed: "demo" });
      await provide(handle);
      await handle.close();
    },
    { scope: "worker" },
  ],
});

// The Brain panel's dock URL gains a ?note= query once a note is selected (the
// selection is part of the panel's persisted URL), so the pane locators match
// on the path prefix rather than the exact URL.
const BRAIN = '[data-testid="dock-panel"][data-dock-url^="/brain"]';
const SETTINGS = '[data-testid="dock-panel"][data-dock-url="/settings"]';

/** Opens Brain and Settings, then splits Settings out of the group as its own column. */
async function splitSettingsBesideBrain(page: import("@playwright/test").Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await navigateTo(page, "Brain");
  await navigateTo(page, "Settings");
  await page.locator('[data-dock-tab][data-dock-url="/settings"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Split right" }).click();
  await expect(page.locator(BRAIN)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(SETTINGS)).toBeVisible({ timeout: 20_000 });
}

interface PaneInfo {
  url: string;
  box: { x: number; y: number; w: number; h: number };
  overflowX: string;
  overflowY: string;
  contentWidth: number;
}

async function paneInfo(page: import("@playwright/test").Page): Promise<PaneInfo[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="dock-panel"]'))
      .filter((p) => p.offsetParent !== null)
      .map((p) => {
        const r = p.getBoundingClientRect();
        const style = getComputedStyle(p);
        return {
          url: p.dataset.dockUrl ?? "",
          box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          contentWidth: p.scrollWidth,
        };
      });
  });
}

test(OVERLAP_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await splitSettingsBesideBrain(page);

  const panes = await paneInfo(page);
  const brain = panes.find((p) => p.url === "/brain")!;
  const settings = panes.find((p) => p.url === "/settings")!;

  // Two real tracks side by side — the panes themselves never overlap.
  expect(brain.box.x + brain.box.w).toBeLessThanOrEqual(settings.box.x);
  expect(brain.box.w).toBeGreaterThan(100);

  // The Brain panel's content is wider than its track (its columns are fixed
  // widths), so before the fix it painted into the Settings pane. Every panel
  // body must clip: overflow visible is exactly the bug.
  expect(brain.contentWidth).toBeGreaterThan(brain.box.w);
  for (const pane of panes) {
    expect(`${pane.url} overflowX=${pane.overflowX} overflowY=${pane.overflowY}`).toBe(
      `${pane.url} overflowX=hidden overflowY=hidden`,
    );
  }

  // And the pointer path works where the user clicks: a note row inside the
  // Brain pane still opens that note (the reported symptom was clicks landing
  // on the neighbouring Settings nav instead). Anchor the name match: another
  // row's excerpt mentions this note via a wikilink, so a substring match is
  // ambiguous.
  const noteTitle = "WebSocket Backpressure Study";
  const brainPanel = page.locator(BRAIN);
  await brainPanel.getByRole("button", { name: new RegExp(`^${noteTitle}\\b`) }).click();
  // Selecting a note puts it in the panel's URL (?note=), which the BRAIN
  // locator's path-prefix match already tolerates.
  await expect(brainPanel.locator('input[placeholder="Untitled note"]')).toHaveValue(noteTitle, {
    timeout: 20_000,
  });
  // The Settings pane never took the click: it is still on its own section.
  await expect(page.locator(SETTINGS).getByRole("heading", { name: "Settings" })).toBeVisible();
});

test(DIVIDER_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await splitSettingsBesideBrain(page);

  // Several splits can coexist (the default workspace ships one); the divider
  // this test drives is the one the setup just created — its right edge sits
  // on the Settings pane's left edge.
  const settingsBox = (await page.locator(SETTINGS).boundingBox())!;
  const dividers = page.getByRole("separator", { name: "Resize columns" });
  const count = await dividers.count();
  let dividerIndex = -1;
  for (let i = 0; i < count; i++) {
    const box = await dividers.nth(i).boundingBox();
    if (box && Math.abs(box.x + box.width - settingsBox.x) <= 8) {
      dividerIndex = i;
      break;
    }
  }
  expect(
    dividerIndex,
    `no horizontal divider sits left of the Settings pane (${count} dividers)`,
  ).toBeGreaterThanOrEqual(0);
  const divider = dividers.nth(dividerIndex);
  const before = Number(await divider.getAttribute("aria-valuenow"));
  expect(before).toBeGreaterThan(0);
  await expect(divider).toHaveAttribute("aria-valuetext", /% for the first pane/);

  // The pane immediately left of that divider is the split's first pane — the
  // Brain pane after the setup — and it must really shrink on screen, not just
  // in the aria attribute.
  const firstPane = page.locator(BRAIN);
  const brainBox = (await firstPane.boundingBox())!;
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => Number(await divider.getAttribute("aria-valuenow")), { timeout: 10_000 })
    .toBe(before - 2);
  const afterBox = (await firstPane.boundingBox())!;
  expect(afterBox.width).toBeLessThan(brainBox.width);

  // Home/End jump to the clamp limits, Shift+Arrow is the coarse step.
  await page.keyboard.press("End");
  await expect.poll(async () => Number(await divider.getAttribute("aria-valuenow"))).toBe(95);
  await page.keyboard.press("Home");
  await expect.poll(async () => Number(await divider.getAttribute("aria-valuenow"))).toBe(5);
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => Number(await divider.getAttribute("aria-valuenow"))).toBe(15);
});
