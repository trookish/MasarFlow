import { test, expect, waitForShellReady } from "./_harness";
import { axeScan } from "./a11y.helpers";
import { openRoute, writeAudit } from "./_audit";

/**
 * P7 T3 accessibility gate: axe-core (WCAG 2 A + AA) over every surface of the 0.2 shell, with NO
 * allow-list. Any violation fails the run; the summary in reports/v0.3/a11y/summary.json names the
 * rule and the node so the fix is direct.
 *
 * One layout only: the Studio dock is gone and the shell is the same six surfaces everywhere, so
 * there is nothing to re-scan per layout.
 */
const SURFACES = ["/today", "/capture", "/work", "/library", "/ai", "/system"];

type RouteResult = { violations: number; byRule: Record<string, number>; nodes: string[] };

test("harness: axe zero", async ({ desktop }) => {
  test.setTimeout(30 * 60_000);
  const { page } = desktop;
  await waitForShellReady(page);
  const byImpact: Record<string, number> = {};
  const perRoute: Record<string, RouteResult> = {};

  for (const href of SURFACES) {
    await openRoute(page, href);
    const scan = await axeScan(page);
    const byRule: Record<string, number> = {};
    const nodes: string[] = [];
    for (const v of scan.violations) {
      byRule[v.id] = (byRule[v.id] ?? 0) + v.nodes.length;
      byImpact[v.impact ?? "unknown"] = (byImpact[v.impact ?? "unknown"] ?? 0) + v.nodes.length;
      for (const n of v.nodes.slice(0, 5)) nodes.push(`${v.id}: ${n.target} :: ${n.html.slice(0, 160)}`);
    }
    perRoute[href] = { violations: scan.violations.reduce((n, v) => n + v.nodes.length, 0), byRule, nodes };
  }

  const total = Object.values(perRoute).reduce((n, r) => n + r.violations, 0);
  writeAudit("a11y/summary.json", { total, byImpact, routes: perRoute });
  const failing = Object.entries(perRoute)
    .filter(([, v]) => v.violations > 0)
    .map(([href, v]) => `${href}: ${Object.keys(v.byRule).join(", ")}`);
  expect(failing).toEqual([]);
});
