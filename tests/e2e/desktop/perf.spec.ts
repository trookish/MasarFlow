import os from "node:os";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  launchApp,
  navigateTo,
  packagedExe,
  waitForShellReady,
  writeEvidence,
} from "./_harness";
import { BUDGETS } from "./perf-budgets";

/**
 * P9.T20 — performance budgets against the packaged app.
 *
 * Deviations from the plan's draft spec, all forced by the real app:
 * - the plan's cold-start test waited for `shell-ready` with `seed: "none"`,
 *   but `shell-ready` only renders while a project is active, so that could
 *   never resolve. Cold start is measured the way a returning user sees it:
 *   an initialized profile (project + completed wizard) launched three times;
 *   the first-run launch (wizard visible) is measured alongside it;
 * - the plan assumed several tabs per dock group. The packaged default layout
 *   gives every route its own group, so the spec first drags one tab into
 *   another group (the dock's real pointer gesture) to form a two-tab group,
 *   and measures the real tab-to-panel switch;
 * - route navigation goes through the dock popup (the packaged default layout),
 *   so it measures link click → destination panel active;
 * - the task file mandates the median (the plan used p95); both are recorded.
 */

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

function machine(): Record<string, unknown> {
  const cpus = os.cpus();
  return {
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: cpus[0]?.model ?? "unknown",
    cores: cpus.length,
    totalMemGb: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
    node: process.version,
  };
}

/**
 * Drags a dock tab into another group's panel area — the pointer-events dock
 * gesture (`use-dock-dnd.tsx`), driven with real mouse input. Committing
 * `move(panelId, targetId, "center")` turns the two groups into one two-tab
 * group, which is what makes a tab switch measurable at all: the packaged
 * default layout gives every route its own single-tab group.
 */
async function dragTabIntoGroup(page: Page, tabUrl: string, targetPanelUrl: string): Promise<void> {
  const src = await page.locator(`[data-dock-tab][data-dock-url="${tabUrl}"]`).first().boundingBox();
  const dst = await page
    .locator(`[data-testid="dock-panel"][data-dock-url="${targetPanelUrl}"]`)
    .first()
    .boundingBox();
  if (!src || !dst) throw new Error("dock drag: missing source tab or target panel");
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  // A few pixels first: a release under 4px is treated as a click, not a drag.
  await page.mouse.move(src.x + src.width / 2 + 20, src.y + src.height / 2 + 20, { steps: 5 });
  await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 20 });
  await page.waitForTimeout(250); // let the workspace measure the drop zones
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test.describe.configure({ mode: "serial" });

test("@slow perf: cold start to interactive (median of 3)", async () => {
  test.setTimeout(12 * 60 * 1000);
  const { _electron: electron } = await import("@playwright/test");
  const env = { ...(process.env as Record<string, string>), MASARFLOW_E2E: "1" };

  // 1. First run on a fresh profile: launch → the setup wizard is up.
  const firstRunSamples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const handle = await launchApp({ seed: "none" });
    await handle.page.getByRole("dialog", { name: "Set up MasarFlow" }).waitFor({ timeout: 120_000 });
    firstRunSamples.push(Date.now() - t0);
    await handle.close();
  }

  // 2. Prepare an initialized profile once (not measured), then measure three
  //    cold launches on it: launch → shell-ready.
  const seeded = await launchApp({ seed: "project" });
  const profileDir = seeded.profileDir;
  await seeded.close();

  const samples: number[] = [];
  const firstPaintSamples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const app = await electron.launch({
      executablePath: packagedExe(),
      args: [`--user-data-dir=${profileDir}/profile`],
      env,
    });
    try {
      const page = await app.firstWindow();
      await page.waitForSelector('[data-testid="app-shell"]', { timeout: 120_000 });
      firstPaintSamples.push(Date.now() - t0);
      await waitForShellReady(page);
      samples.push(Date.now() - t0);
    } finally {
      await app.close().catch(() => {});
    }
  }

  const md = median(samples);
  writeEvidence("perf-cold-start.json", {
    machine: machine(),
    initializedProfile: {
      samples,
      firstPaintSamples,
      median: md,
      p95: p95(samples),
      budget: BUDGETS.coldStartToInteractiveMs,
    },
    firstRunToWizard: { samples: firstRunSamples, median: median(firstRunSamples) },
  });
  expect(md, `cold start ${md} ms (samples ${samples.join(",")})`).toBeLessThanOrEqual(
    BUDGETS.coldStartToInteractiveMs,
  );
});

test("perf: dock tab interaction and route navigation", async ({ desktop }) => {
  const { page } = desktop;

  await navigateTo(page, "Dashboard");
  await navigateTo(page, "Brain");

  // Make a two-tab group the way a user does — drag the Brain tab onto the
  // Dashboard panel — so a tab click really switches visible panels.
  await dragTabIntoGroup(page, "/brain", "/dashboard");

  const groups = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tablist"]'))
      .map((tl) =>
        Array.from(tl.querySelectorAll<HTMLElement>("[data-dock-tab]")).map(
          (t) => t.dataset.dockUrl ?? "",
        ),
      )
      .filter((urls) => urls.length > 1),
  );
  expect(
    groups.length,
    `no dock group has more than one tab (tabs: ${JSON.stringify(
      await page.locator("[data-dock-tab]").evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.dockUrl),
      ),
    )})`,
  ).toBeGreaterThan(0);

  // Tab switches, in-page: click a tab whose panel is hidden → that panel shows.
  const dockSamples: number[] = [];
  const dockAttempts: unknown[] = [];
  const urls = groups[0];
  for (let i = 0; i < 14 && dockSamples.length < 10; i++) {
    const target = urls[i % 2];
    const result = await page.evaluate(
      async ({ url }) => {
        const tab = Array.from(
          document.querySelectorAll<HTMLElement>(`[data-dock-tab][data-dock-url="${url}"]`),
        ).find((t) => t.offsetParent !== null);
        if (!tab) return { dt: -1, why: "no visible tab" };
        // The panel host only carries the active tab's url, so re-query every
        // frame — the element appears (or flips its data-dock-url) on switch.
        const visible = () =>
          Array.from(
            document.querySelectorAll<HTMLElement>(
              `[data-testid="dock-panel"][data-dock-url="${url}"]`,
            ),
          ).some((p) => p.offsetParent !== null);
        if (visible()) return { dt: -2, why: "already visible" }; // nothing to measure
        const t0 = performance.now();
        tab.click();
        for (;;) {
          if (visible()) return { dt: performance.now() - t0, why: "ok" };
          if (performance.now() - t0 > 5000) {
            return { dt: -1, why: "timeout", selected: tab.getAttribute("aria-selected") };
          }
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
      },
      { url: target },
    );
    dockAttempts.push({ i, target, ...result });
    if (result.dt >= 0) dockSamples.push(Math.round(result.dt));
    // Let the app settle: a click issued in the same frame the previous switch
    // committed is ignored by the dock (its focus effect runs one tick later).
    await page.waitForTimeout(150);
  }

  // Route navigation, in-page: dock link click → destination panel active.
  // Ten iterations alternating between two routes (P9.T20 step 1).
  const navSamples: number[] = [];
  const work = page.getByRole("button", { name: "Work", exact: true });
  for (let i = 0; i < 10; i++) {
    const url = i % 2 === 0 ? "/tasks" : "/today";
    await work.click(); // open the dock group popup (setup, not measured)
    await expect(page.getByRole("menu").getByRole("link").first()).toBeVisible();
    const dt = await page.evaluate(async ({ url }) => {
      const link = Array.from(document.querySelectorAll<HTMLElement>(`a[href="${url}"]`)).find(
        (el) => el.offsetParent !== null,
      );
      if (!link) return -1;
      const t0 = performance.now();
      link.click();
      for (;;) {
        const panel = document.querySelector<HTMLElement>(
          `[data-testid="dock-panel"][data-dock-url="${url}"]`,
        );
        if (panel && panel.offsetParent !== null) return performance.now() - t0;
        if (performance.now() - t0 > 5000) return -1;
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
    }, { url });
    if (dt >= 0) navSamples.push(Math.round(dt));
  }

  const dockMedian = median(dockSamples);
  const navMedian = median(navSamples);
  // Evidence first: a failing budget must still leave the measurements behind.
  writeEvidence("perf-interaction.json", {
    machine: machine(),
    dock: {
      groups: groups.length,
      groupTabs: groups[0],
      samples: dockSamples,
      attempts: dockAttempts,
      median: dockMedian,
      p95: p95(dockSamples),
      budget: BUDGETS.dockTabToPanelMs,
    },
    routeNav: {
      samples: navSamples,
      median: navMedian,
      p95: p95(navSamples),
      budget: BUDGETS.routeNavToContentMs,
    },
  });
  expect(dockSamples.length, "no dock tab switch could be measured").toBeGreaterThan(0);
  expect(navSamples.length, "no route navigation could be measured").toBe(10);
  expect(
    dockMedian,
    `dock median ${dockMedian} ms (${dockSamples.length} samples)`,
  ).toBeLessThanOrEqual(BUDGETS.dockTabToPanelMs);
  expect(
    navMedian,
    `route nav median ${navMedian} ms (${navSamples.length} samples)`,
  ).toBeLessThanOrEqual(BUDGETS.routeNavToContentMs);
});
