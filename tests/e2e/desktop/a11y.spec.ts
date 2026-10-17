import { test, expect, navigateTo, launchApp, writeEvidence } from "./_harness";
import {
  ALLOW_LIST,
  applyAllowList,
  axeScan,
  namelessControls,
  type AxeViolation,
} from "./a11y.helpers";

/**
 * P9.T19 — axe-core scans and keyboard-only journeys against the packaged app.
 *
 * Deviations from the plan's draft, all forced by the real app:
 * - the plan clicked `getByRole("link", …)`; the packaged shell defaults to the
 *   bottom floating dock (nav links live in group popups), so navigation goes
 *   through the harness's `navigateTo`;
 * - the plan's fallback "injected axe-core" path is the primary one here:
 *   @axe-core/playwright cannot run against Electron (see a11y.helpers.ts);
 * - the plan's `axe.run(undefined, …)` throws on axe-core 4.x — the helper
 *   passes `document` instead.
 */

const ROUTES: [string, string][] = [
  // [navigateTo label, human label]
  ["Dashboard", "Dashboard"],
  ["Brain", "Brain"],
  ["Task Boards", "Tasks"],
  ["Chat", "Chat"],
  ["Settings", "Settings"],
  ["Plugins", "Plugins"],
];

function describe(violations: AxeViolation[]): string {
  return violations
    .map(
      (v) =>
        `${v.id} [${v.impact}] ×${v.nodes.length} → ${v.nodes
          .map((n) => n.target)
          .join(" | ")}`,
    )
    .join("; ");
}

test("a11y: no serious or critical axe violations in the packaged shell", async ({ desktop }) => {
  const { page } = desktop;
  const routes: Record<string, unknown> = {};
  const failures: string[] = [];
  const matchedSelectors = new Set<string>();

  for (const [label, human] of ROUTES) {
    await navigateTo(page, label);
    // Let the dock panel paint and any live query settle before scanning.
    await page.waitForTimeout(600);
    const scan = await axeScan(page);
    const nameless = await namelessControls(page);
    const { failing, allowed, unmatched } = applyAllowList(
      [...scan.violations, ...nameless],
      ALLOW_LIST,
    );
    for (const entry of ALLOW_LIST) {
      if (!unmatched.includes(entry)) matchedSelectors.add(entry.selector);
    }

    // Evidence is written per route so a failure still leaves the findings.
    routes[human] = {
      engine: scan.engine,
      tags: scan.tags,
      violations: scan.violations,
      namelessControls: nameless,
      allowListed: allowed,
      failing,
    };
    writeEvidence("a11y/summary.json", {
      generatedAt: new Date().toISOString(),
      routes,
      allowList: ALLOW_LIST,
    });

    if (failing.length > 0) {
      failures.push(`${human} (${scan.engine}): ${describe(failing)}`);
    }
  }

  // A stale allow-list entry is a failure too: it means the finding is gone
  // (fix it for real) or the selector drifted (update it).
  const stale = ALLOW_LIST.filter((e) => !matchedSelectors.has(e.selector));
  if (stale.length > 0) {
    failures.push(
      "allow-list entries matched nothing — remove or re-point them: " +
        stale.map((e) => `${e.rule} @ ${e.selector} (${e.owner})`).join("; "),
    );
  }

  expect(failures, failures.join("\n")).toEqual([]);
});

test("a11y: every interactive element exposes an accessible name", async ({ desktop }) => {
  const { page } = desktop;
  const failures: string[] = [];
  const matchedSelectors = new Set<string>();

  for (const [label, human] of ROUTES) {
    await navigateTo(page, label);
    // Panels load lazily; give the destination panel time to paint before the
    // name check (the plugin list is the slowest one).
    await page.waitForTimeout(700);
    const { failing, unmatched } = applyAllowList(await namelessControls(page), ALLOW_LIST);
    for (const entry of ALLOW_LIST) {
      if (!unmatched.includes(entry)) matchedSelectors.add(entry.selector);
    }
    if (failing.length > 0) failures.push(`${human}: ${describe(failing)}`);
  }

  const namelessEntries = ALLOW_LIST.filter((e) => e.rule === "custom:nameless-control");
  const stale = namelessEntries.filter((e) => !matchedSelectors.has(e.selector));
  if (stale.length > 0) {
    failures.push(
      "nameless-control allow-list entries matched nothing: " +
        stale.map((e) => `${e.selector} (${e.owner})`).join("; "),
    );
  }

  expect(failures, failures.join("\n")).toEqual([]);
});

test("a11y: keyboard-only journey — the palette opens a page and the dock is reachable", async ({
  desktop,
}) => {
  const { page } = desktop;

  // 1. Ctrl+K opens the palette with focus in its input; typing + Enter alone
  //    navigates to the page. (cmdk's input is a combobox, not a textbox.)
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect
    .poll(() => palette.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
  await palette.getByRole("combobox").fill("Task Boards");
  // Entity hits ("Items") render above the "Commands" group, so the page
  // command is not the initial selection: ArrowDown is how a keyboard user
  // reaches it. Walk until the selected row is the page command.
  const selectedRow = () =>
    page.evaluate(
      () =>
        (
          document.querySelector('[role="dialog"] [cmdk-item][aria-selected="true"]')
            ?.textContent ?? ""
        ).trim(),
    );
  let reachedCommand = false;
  for (let i = 0; i < 12 && !reachedCommand; i++) {
    reachedCommand = (await selectedRow()).includes("Open Task Boards");
    if (!reachedCommand) await page.keyboard.press("ArrowDown");
  }
  expect(reachedCommand, `palette selection stuck on "${await selectedRow()}"`).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="dock-panel"][data-dock-url="/tasks"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Task Boards" }).first()).toBeVisible();

  // 2. The dock's group buttons are real buttons; Enter opens the Capture
  //    popup, and the links inside are reachable and activatable by keyboard.
  const capture = page.getByRole("button", { name: "Capture", exact: true });
  await capture.focus();
  await page.keyboard.press("Enter");
  const popup = page.getByRole("menu");
  await expect(popup.getByRole("link", { name: "Brain", exact: true })).toBeVisible();

  // The popup sits before the dock nav in the DOM, so Shift+Tab walks back
  // into it. Chromium makes the popup's scroll container focusable too, so
  // step backwards until focus is on a link inside the popup.
  let landed = { name: "", isPopupLink: false };
  for (let i = 0; i < 5 && !landed.isPopupLink; i++) {
    await page.keyboard.press("Shift+Tab");
    landed = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        name: el?.textContent?.trim() ?? "",
        isPopupLink: el?.tagName === "A" && Boolean(el.closest('[role="menu"]')),
      };
    });
  }
  expect(
    landed.isPopupLink,
    `Shift+Tab never reached a link in the popup (landed on "${landed.name}")`,
  ).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="dock-panel"][data-dock-url="/files"]')).toBeVisible({
    timeout: 15_000,
  });
});

test("a11y: keyboard-only journey — the first-run wizard contains focus", async () => {
  const { page, close } = await launchApp({ seed: "none" });
  try {
    const dialog = page.getByRole("dialog", { name: "Set up MasarFlow" });
    await expect(dialog).toBeVisible();
    // Focus must be inside the dialog (not on the page behind it).
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    // Tab stays inside the dialog.
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    // The wizard is mandatory: Escape must NOT dismiss first-run setup.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  } finally {
    await close();
  }
});
