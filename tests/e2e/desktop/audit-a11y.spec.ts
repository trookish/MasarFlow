import { test, expect, applyLayout, waitForShellReady } from "./_harness";
import { axeScan } from "./a11y.helpers";
import { navRoutes, openRoute, writeAudit } from "./_audit";

/**
 * P7 T3 accessibility gate: axe-core (WCAG 2 A + AA) over every nav route and every surface, in
 * the Studio and the standard layout, with NO allow-list. Any violation fails the run; the summary
 * in reports/v0.3/a11y/summary.json names the rule and the node so the fix is direct.
 */
const SURFACES = ["/today", "/capture", "/work", "/library", "/ask", "/system"];

type RouteResult = { violations: number; byRule: Record<string, number>; nodes: string[] };

test("harness: axe zero", async ({ desktop }) => {
  test.setTimeout(30 * 60_000);
  const { page } = desktop;
  const results: Record<string, Record<string, RouteResult>> = {};
  const byImpact: Record<string, number> = {};

  for (const layout of ["studio", "standard"] as const) {
    await applyLayout(page, layout);
    await waitForShellReady(page);
    const routes = [...new Set([...navRoutes().map((r) => r.href), ...SURFACES])];
    const perRoute: Record<string, RouteResult> = {};
    for (const href of routes) {
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
    results[layout] = perRoute;
  }

  const total = Object.values(results)
    .flatMap((r) => Object.values(r))
    .reduce((n, r) => n + r.violations, 0);
  writeAudit("a11y/summary.json", { total, byImpact, layouts: results });
  const failing = Object.entries(results).flatMap(([layout, r]) =>
    Object.entries(r)
      .filter(([, v]) => v.violations > 0)
      .map(([href, v]) => `${layout} ${href}: ${Object.keys(v.byRule).join(", ")}`),
  );
  expect(failing).toEqual([]);
});
