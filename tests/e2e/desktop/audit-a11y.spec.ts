import { test, expect } from "./_harness";
import { axeScan } from "./a11y.helpers";
import { navRoutes, openRoute, writeAudit } from "./_audit";

/**
 * P0.T7 accessibility harness: axe-core over every nav route with NO allow-list. Records only;
 * P7 turns any violation into a failure.
 */
test("harness: axe zero", async ({ desktop }) => {
  test.setTimeout(20 * 60_000);
  const { page } = desktop;
  const routes = navRoutes();
  const perRoute: Record<string, { violations: number; byRule: Record<string, number> }> = {};
  const byImpact: Record<string, number> = {};
  for (const { href } of routes) {
    await openRoute(page, href);
    const scan = await axeScan(page);
    const byRule: Record<string, number> = {};
    for (const v of scan.violations) {
      byRule[v.id] = (byRule[v.id] ?? 0) + v.nodes.length;
      byImpact[v.impact ?? "unknown"] = (byImpact[v.impact ?? "unknown"] ?? 0) + v.nodes.length;
    }
    perRoute[href] = { violations: scan.violations.reduce((n, v) => n + v.nodes.length, 0), byRule };
  }
  const total = Object.values(perRoute).reduce((n, r) => n + r.violations, 0);
  writeAudit("a11y/summary.json", { allowList: [], total, byImpact, routes: perRoute });
  expect(Object.keys(perRoute).length).toBe(routes.length);
});
