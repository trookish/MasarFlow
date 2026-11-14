import type { Page } from "@playwright/test";
import { test, expect, navigateTo, readTable, surfacePanel } from "./_harness";

/**
 * The 0.2 shell in the packaged app: one linear project tab strip above the
 * content, one surface per tab, an Inspector on the right at >= xl widths.
 *
 * These replace the deleted dock specs (tests/e2e/desktop/dock.spec.ts): the
 * split panes, dividers and drag-dock they exercised no longer exist, but the
 * tab strip, its keyboard shortcuts and the Inspector are new real features.
 *
 * Tab ids are page ids and may carry a query snapshot ("/library?doc=abc"), so
 * every tab locator matches the exact route or a "?query" suffix — never a bare
 * prefix, which would also catch /workflow for /work.
 */
function tab(page: Page, route: string) {
  return page.locator(`[data-dock-tab]:is([data-dock-url="${route}"],[data-dock-url^="${route}?"])`);
}

function tablist(page: Page) {
  return page.getByRole("tablist", { name: "Project tabs" });
}

test("/work: opening surfaces adds project tabs and Ctrl+W closes the focused one", async ({
  desktop,
}) => {
  const { page } = desktop;
  const tabs = tablist(page);

  // A fresh project opens one calm tab — no preset split layout to close.
  await expect(tabs).toBeVisible({ timeout: 30_000 });
  await expect(tabs.getByRole("tab")).toHaveCount(1);
  await expect(tabs.getByRole("tab").first()).toHaveText(/Today/);

  // Opening a surface adds its tab and keeps the one already open.
  await navigateTo(page, "Work");
  await expect(tab(page, "/work")).toHaveCount(1);
  await expect(tabs.getByRole("tab")).toHaveCount(2);

  await navigateTo(page, "Library");
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  // /library is the Library surface's default section, so sectionUrl() gives the
  // bare route (no ?view=docs) — same rule the legacy redirects follow.
  await expect(page).toHaveURL(/\/library(\?|$)/);

  // Re-opening a surface that already has a tab focuses it instead of adding
  // a duplicate.
  await navigateTo(page, "Work");
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await expect(tab(page, "/work")).toHaveAttribute("aria-selected", "true");

  // Ctrl+W closes the focused tab and the neighbour takes over — Work.
  await navigateTo(page, "Library");
  await page.keyboard.press("Control+w");
  await expect(tab(page, "/library")).toHaveCount(0);
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await expect(tab(page, "/work")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/work(\?|$)/);

  // Delete on the focused tab button does the same job one-handed: the tab
  // count drops and a remaining tab is selected and focused.
  const active = tabs.locator('[role="tab"][aria-selected="true"]');
  await active.focus();
  await page.keyboard.press("Delete");
  await expect(tabs.getByRole("tab")).toHaveCount(1);
  await expect(tabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  await expect(page).toHaveURL(/\/today(\?|$)/);
});

test("/work: Ctrl+Shift+T reopens the last closed tab", async ({ desktop }) => {
  const { page } = desktop;
  const tabs = tablist(page);

  await navigateTo(page, "Work");
  await navigateTo(page, "Library");
  await expect(tabs.getByRole("tab")).toHaveCount(3);

  await page.keyboard.press("Control+w");
  await expect(tab(page, "/library")).toHaveCount(0);
  await expect(tabs.getByRole("tab")).toHaveCount(2);

  // Ctrl+Shift+T puts it back, in front, with its page rendering again.
  await page.keyboard.press("Control+Shift+t");
  await expect(tab(page, "/library")).toHaveCount(1);
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await expect(tab(page, "/library")).toHaveAttribute("aria-selected", "true");
  await expect(surfacePanel(page, "Library")).toBeVisible();
  await expect(page.locator('[data-surface="library"]')).toHaveAttribute("data-section", "docs");
});

test("/work: Ctrl+W in the same tick as a section switch still closes the tab", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Work");
  await navigateTo(page, "Library");

  // Close the tab in the microtask right after the section switch commits, before the app's URL
  // sync has handled that navigation. The sync used to treat the pending URL as a fresh visit and
  // reopen the tab, which is what made "Ctrl+Shift+T reopens the last closed tab" flaky.
  await page.evaluate(() => {
    const surface = document.querySelector('[data-surface="library"]')!;
    const observer = new MutationObserver(() => {
      if (surface.getAttribute("data-section") !== "standards") return;
      observer.disconnect();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", ctrlKey: true, bubbles: true }));
    });
    observer.observe(surface, { attributes: true, attributeFilter: ["data-section"] });
  });
  await page.locator('[data-surface="library"]').getByRole("tab", { name: "Standards", exact: true }).click();
  await expect(tab(page, "/library")).toHaveCount(0);
  await expect(page).toHaveURL(/\/work(\?|$)/);
  await page.waitForTimeout(500);
  await expect(tab(page, "/library")).toHaveCount(0);

  // And it is the tab Ctrl+Shift+T brings back, on the section that was open.
  await page.keyboard.press("Control+Shift+t");
  await expect(tab(page, "/library")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-surface="library"]')).toHaveAttribute("data-section", "standards");
});

test("/work: a pinned tab moves to the front, keeps only its icon and refuses to close", async ({ desktop }) => {
  const { page } = desktop;
  const tabs = tablist(page);

  await navigateTo(page, "Work");
  await navigateTo(page, "Library");
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  const library = tab(page, "/library");
  const libraryBox = library.locator("xpath=..");

  // Pin from the tab's context menu.
  await library.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin tab" }).click();
  await expect(libraryBox).toHaveAttribute("data-pinned", "");
  await expect(tabs.getByRole("tab").first()).toHaveAttribute("data-dock-url", /^\/library/);
  await expect(library).toHaveAccessibleName("Library");
  await expect(library).toHaveAccessibleDescription("Pinned");
  // Icon only: the label leaves the strip, so the pinned tab is narrower than an ordinary one.
  const pinnedWidth = (await library.boundingBox())!.width;
  const workWidth = (await tab(page, "/work").boundingBox())!.width;
  expect(pinnedWidth).toBeLessThan(workWidth);

  // Ctrl+W on a pinned tab keeps it and says why.
  await library.click();
  await page.keyboard.press("Control+w");
  await expect(page.getByText("Library is pinned", { exact: true })).toBeVisible();
  await expect(tabs.getByRole("tab")).toHaveCount(3);

  // Unpin from the keyboard: Shift+F10 opens the same menu with its first item focused.
  await library.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Unpin tab" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(libraryBox).not.toHaveAttribute("data-pinned", "");
  await page.keyboard.press("Control+w");
  await expect(tab(page, "/library")).toHaveCount(0);
});

test("/work: a tab shows an unsaved-changes dot until its editor's autosave lands", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Specifications");
  const active = page.locator('[data-testid="dock-panel"]');
  await active.getByRole("button", { name: "New spec" }).first().click();
  const titleInput = active.getByPlaceholder("Spec title");
  await expect(titleInput).toHaveValue("Untitled spec", { timeout: 15_000 });

  const strip = tablist(page);
  const selected = strip.locator('[role="tab"][aria-selected="true"]');
  await expect(strip.locator("[data-unsaved]")).toHaveCount(0);
  // Typing keeps restarting the 450 ms autosave, so the edit stays unwritten while keys arrive.
  await titleInput.fill("");
  const typing = titleInput.pressSequentially(`Dot spec ${Date.now()}`, { delay: 120 });
  await expect(strip.locator("[data-unsaved] [data-unsaved-dot]")).toHaveCount(1, { timeout: 2_000 });
  await expect(selected).toHaveAccessibleDescription("Unsaved changes");
  await typing;
  // Once the write lands the dot goes.
  await expect(strip.locator("[data-unsaved]")).toHaveCount(0, { timeout: 5_000 });
  const title = await titleInput.inputValue();
  await expect
    .poll(async () => (await readTable<{ title: string }>(page, "specs")).some((s) => s.title === title))
    .toBe(true);
});

test("/work: the inspector follows the selected task", async ({ desktop }) => {
  const { page } = desktop;
  const inspector = page.getByTestId("inspector");

  // The Inspector is docked by default at the packaged window's 1440 px.
  await expect(inspector).toBeVisible({ timeout: 30_000 });

  await navigateTo(page, "Work");
  const tasks = await readTable(page, "tasks");
  expect(tasks.length).toBeGreaterThan(0);
  // The table holds every demo project's tasks; take one the active project's
  // board actually shows.
  const board = surfacePanel(page, "Work");
  let title = "";
  await expect(async () => {
    for (const t of tasks) {
      const candidate = String(t.title);
      if ((await board.getByText(candidate, { exact: true }).filter({ visible: true }).count()) > 0) {
        title = candidate;
        return;
      }
    }
    throw new Error("no seeded task is visible on the Work board yet");
  }).toPass({ timeout: 20_000 });

  // Opening a task card selects it in the tab's URL (?task=) and opens it in the
  // Inspector, which floats over the board so the board keeps its full width.
  // Kept-alive tabs stay in the DOM hidden (Today lists the same task), so
  // click the visible card on the Work tab.
  await surfacePanel(page, "Work").getByText(title, { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/task=/);

  await expect(inspector.getByPlaceholder("Task title")).toHaveValue(title, { timeout: 20_000 });
  await expect(inspector.getByRole("button", { name: "Delete task" })).toBeVisible();

  // Closing the task clears the selection, and the Inspector says so rather
  // than keeping a stale entity.
  await inspector.getByRole("button", { name: "Close" }).click();
  await expect(page.getByPlaceholder("Task title")).toHaveCount(0);
  await expect(page).not.toHaveURL(/task=[^&]/);
});

test("/library: Ask about this opens Ask and keeps the item open", async ({ desktop }) => {
  const { page } = desktop;
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toBeVisible({ timeout: 30_000 });

  // The topbar button toggles the Inspector; state is real, not cosmetic.
  await page.getByRole("button", { name: "Hide inspector" }).click();
  await expect(inspector).toHaveCount(0);
  await page.getByRole("button", { name: "Show inspector" }).click();
  await expect(inspector).toBeVisible();

  await navigateTo(page, "Documentation");
  const doc = "Architecture Overview";
  await surfacePanel(page, "Documentation")
    .getByRole("button", { name: doc, exact: true })
    .first()
    .click();

  // A doc selection is inline (no modal), so this is the flow a user can walk:
  // the Inspector names the entity, its kind and its properties.
  // The kind badge (the Properties list also has a Type: Doc row).
  await expect(inspector.getByText("Doc", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(inspector.getByRole("heading", { name: doc })).toBeVisible({ timeout: 20_000 });
  await expect(inspector.getByRole("heading", { name: "Properties" })).toBeVisible();
  await expect(page).toHaveURL(/doc=/);

  await inspector.getByRole("button", { name: "Ask about this" }).click();

  // AI opens with the doc still open in its own tab — the context it advertises.
  await expect(page).toHaveURL(/\/ai/, { timeout: 20_000 });
  await expect(page.locator('[data-surface="ai"]')).toBeVisible({ timeout: 20_000 });
  await expect(tab(page, "/library")).toHaveCount(1);
  await expect(tab(page, "/ai")).toHaveAttribute("aria-selected", "true");
});

test("/work: kept-alive tabs never push the active tab below the strip", async ({ desktop }) => {
  const { page } = desktop;
  const tabs = tablist(page);
  await expect(tabs).toBeVisible({ timeout: 30_000 });

  // Four mounted tabs: the regression stacked their wrappers vertically, so the
  // last-opened surface rendered below the fold and <main> scrolled the tab strip
  // and the inspector out of view.
  for (const name of ["Work", "Library", "AI", "System"]) {
    await navigateTo(page, name);
    await expect(tabs).toBeInViewport();
    const strip = await tabs.boundingBox();
    const panel = await page.getByTestId("dock-panel").boundingBox();
    expect(strip, "tab strip has a box").not.toBeNull();
    expect(panel, "active panel has a box").not.toBeNull();
    // The active panel starts directly under the strip, not half a window lower.
    expect(panel!.y - (strip!.y + strip!.height)).toBeLessThan(8);
    const scrolled = await page.locator("main").evaluate((el) => el.scrollTop);
    expect(scrolled).toBe(0);
  }
  // Exactly one panel is in the layout; the others are hidden, not stacked.
  await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
});

test("/system: interface preferences change the sidebar and inspector and persist", async ({ desktop }) => {
  const { page } = desktop;
  const sidebar = page.getByTestId("surface-sidebar");
  await navigateTo(page, "Settings");
  await page.getByRole("button", { name: "Interface", exact: true }).first().click();

  await page.getByRole("button", { name: "Icon rail", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  // The sidebar animates its width, so poll rather than read one frame.
  const width = async () => (await sidebar.boundingBox())?.width ?? 0;
  await expect.poll(width).toBeLessThan(80);

  const inspectorRow = page.locator("div").filter({ has: page.getByText("Inspector", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Off" }) }).last();
  await inspectorRow.getByRole("button", { name: "Off", exact: true }).click();
  await expect(page.getByTestId("inspector")).toHaveCount(0);

  // Both survive a reload (persisted UI store).
  await page.reload();
  await page.getByTestId("shell-ready").waitFor({ timeout: 60_000 });
  await expect(page.getByTestId("inspector")).toHaveCount(0);
  await expect.poll(width).toBeLessThan(80);

  await page.getByRole("button", { name: "Interface", exact: true }).first().click();
  await page.getByRole("button", { name: "Full", exact: true }).click();
  await inspectorRow.getByRole("button", { name: "On", exact: true }).click();
  await expect(page.getByTestId("inspector")).toBeVisible();
  await expect.poll(width).toBeGreaterThan(150);
});

test("/system: sidebar position moves the navigation to the right edge or a collapsible bottom dock and persists", async ({ desktop }) => {
  const { page } = desktop;
  const shell = page.getByTestId("app-shell");
  const surfaces = page.getByRole("navigation", { name: "Surfaces" });
  const openInterface = async () => {
    await navigateTo(page, "Settings");
    await page.getByRole("button", { name: "Interface", exact: true }).first().click();
  };
  const positionButton = (name: string) =>
    page
      .locator("div")
      .filter({ has: page.getByText("Sidebar position", { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "Bottom", exact: true }) })
      .last()
      .getByRole("button", { name, exact: true });

  // The logo and the icons keep one size and place while the rail expands or
  // collapses; only the labels come and go.
  const sidebar = page.getByTestId("surface-sidebar");
  const logo = sidebar.getByRole("img", { name: "MasarFlow" });
  const firstChip = surfaces.getByRole("link").first().locator("span").first();
  const boxes = async () => [await logo.boundingBox(), await firstChip.boundingBox()];
  await openInterface();
  const expanded = await boxes();
  await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeLessThan(80);
  expect(await boxes()).toEqual(expanded);
  await sidebar.getByRole("button", { name: "Expand sidebar" }).click();
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(150);
  expect(await boxes()).toEqual(expanded);

  // The active surface wears the accent on its icon chip.
  const activeLink = surfaces.locator('[aria-current="page"]');
  await expect(activeLink).toHaveCount(1);
  await expect(activeLink.locator(".accent-icon")).toHaveCount(1);

  // Right edge.
  await positionButton("Right").click();
  await expect(shell).toHaveAttribute("data-sidebar-position", "right");
  await expect(sidebar).toHaveAttribute("data-side", "right");
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  expect((await sidebar.boundingBox())!.x).toBeGreaterThan(viewport.width / 2);

  // Bottom dock: the six surfaces, below the content.
  await positionButton("Bottom").click();
  await expect(shell).toHaveAttribute("data-sidebar-position", "bottom");
  await expect(sidebar).toHaveCount(0);
  const dock = page.getByTestId("surface-dock");
  await expect(dock).toHaveAttribute("data-collapsed", "false");
  await expect(surfaces.getByRole("link")).toHaveCount(6);
  expect((await dock.boundingBox())!.y).toBeGreaterThan(viewport.height / 2);

  // The dock navigates like the rail.
  await navigateTo(page, "Work");
  await expect(surfaces.locator('[aria-current="page"]')).toHaveAttribute("aria-label", "Work");

  // It collapses to one button and expands again, by click and by Ctrl+B.
  await dock.getByRole("button", { name: "Collapse dock" }).click();
  await expect(dock).toHaveAttribute("data-collapsed", "true");
  await expect(surfaces).toHaveCount(0);
  await dock.getByRole("button", { name: "Expand dock" }).click();
  await expect(surfaces.getByRole("link")).toHaveCount(6);
  await page.keyboard.press("Control+b");
  await expect(dock).toHaveAttribute("data-collapsed", "true");

  // Position and folded state survive a reload (persisted UI store).
  await page.reload();
  await page.getByTestId("shell-ready").waitFor({ timeout: 60_000 });
  await expect(shell).toHaveAttribute("data-sidebar-position", "bottom");
  await expect(dock).toHaveAttribute("data-collapsed", "true");
  await page.keyboard.press("Control+b");
  await expect(dock).toHaveAttribute("data-collapsed", "false");

  await openInterface();
  await positionButton("Left").click();
  await expect(shell).toHaveAttribute("data-sidebar-position", "left");
  await expect(sidebar).toHaveAttribute("data-side", "left");
  await expect(page.getByTestId("surface-dock")).toHaveCount(0);
});
