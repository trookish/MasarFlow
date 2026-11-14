import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, REPO_ROOT, setWindowContentSize } from "./_harness";

/** Parsed as text (importing surfaces.ts would pull React into Node), like _audit.navRoutes. */
function readSurfaces() {
  const src = readFileSync(path.join(REPO_ROOT, "src", "lib", "navigation", "surfaces.ts"), "utf8");
  const blocks = src.split(/\r?\n  \{\r?\n    id: "/).slice(1);
  return blocks.map((b) => {
    const id = b.slice(0, b.indexOf('"'));
    const label = /label: "([^"]+)"/.exec(b)![1];
    const sections = [...b.matchAll(/\{ id: "[^"]+", label: "([^"]+)", href: "([^"]+)" \}/g)].map((m) => ({ label: m[1], href: m[2] }));
    return { id, label, sections };
  });
}
const SURFACES = readSurfaces();

/**
 * UI audit sweep (overhaul P0). Not part of the gate: the `zz-probe` prefix is excluded by the
 * grep-invert. Opens every surface section in the packaged app (demo data), screenshots it at three
 * window sizes and records the tab strip after every click, so the duplicate-tab report can be
 * reproduced from data. Output: reports/ui-audit/ (kept out of commits).
 */
const OUT = path.join(REPO_ROOT, "reports", "ui-audit");
const SIZES = [
  { w: 1000, h: 640 },
  { w: 1280, h: 800 },
  { w: 1600, h: 900 },
];

interface TabRecord {
  step: string;
  count: number;
  tabs: Array<{ url: string | null; label: string; selected: string | null }>;
  address: string;
}

test("probe: sweep every section and trace the tab strip", async ({ desktop }) => {
  test.setTimeout(25 * 60_000);
  const { app, page } = desktop;
  mkdirSync(OUT, { recursive: true });
  const trace: TabRecord[] = [];

  const snapTabs = async (step: string) => {
    const tabs = await page.$$eval("[data-dock-tab]", (els) =>
      els.map((e) => ({
        url: e.getAttribute("data-dock-url"),
        label: (e.textContent ?? "").trim(),
        selected: e.getAttribute("aria-selected"),
      })),
    );
    trace.push({ step, count: tabs.length, tabs, address: page.url() });
  };

  for (const size of SIZES) {
    await setWindowContentSize(app, size.w, size.h);
    await page.waitForTimeout(500);
    for (const surface of SURFACES) {
      const link = page.getByRole("navigation", { name: "Surfaces" }).getByRole("link", { name: surface.label, exact: true });
      await link.click();
      await snapTabs(`${size.w}: click ${surface.label}`);
      const view = page.locator(`[data-surface="${surface.id}"]`);
      await expect(view).toBeVisible({ timeout: 30_000 });
      for (const section of surface.sections) {
        const tab = view.getByRole("tab", { name: section.label, exact: true });
        if ((await tab.count()) > 0) await tab.first().click();
        await page.waitForTimeout(900);
        await snapTabs(`${size.w}: ${surface.label} › ${section.label}`);
        const slug = section.href.replace(/^\//, "").replace(/\//g, "-") || "root";
        await page.screenshot({ path: path.join(OUT, `${surface.id}-${slug}-${size.w}.png`) });
      }
    }
  }
  // Click each already-open surface link twice more: the user-reported duplicate.
  await setWindowContentSize(app, 1280, 800);
  for (const surface of SURFACES) {
    const link = page.getByRole("navigation", { name: "Surfaces" }).getByRole("link", { name: surface.label, exact: true });
    for (let i = 0; i < 2; i++) {
      await link.click();
      await page.waitForTimeout(500);
      await snapTabs(`repeat ${i + 1}: ${surface.label}`);
    }
  }
  writeFileSync(path.join(OUT, "tab-trace.json"), JSON.stringify(trace, null, 2) + "\n", "utf8");
  const max = Math.max(...trace.map((t) => t.count));
  test.info().annotations.push({ type: "tabs", description: `max tabs open: ${max}` });
  expect(trace.length).toBeGreaterThan(20);
});
