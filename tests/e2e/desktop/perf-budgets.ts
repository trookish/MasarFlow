/**
 * Committed thresholds for P9.T20 (see reports/p9/perf-baseline.md).
 *
 * Set from the first measured run with ≤1.5× headroom, then frozen: the point
 * of a budget is that it stops moving. Changing one requires the measured
 * numbers in the commit body. `docs/ui-budget.md` states the interaction
 * budgets the product committed to; where the two disagreed the P9 plan's
 * numbers win (recorded in reports/p9/perf-baseline.md).
 */
export const BUDGETS = {
  /**
   * Launch → '[data-testid="shell-ready"]' visible on an initialized profile
   * (project exists, wizard already completed), median of 3 cold launches.
   */
  coldStartToInteractiveMs: 9000,
  /** Tab click → that tab's panel active ([data-testid="dock-panel"][data-dock-url]), in-page, median of the samples. */
  dockTabToPanelMs: 250,
  /** Nav link click → destination surface painted, in-page, median of 10 samples. */
  routeNavToContentMs: 700,
  /** 10 minutes idle with a project open (T21). */
  memory: { mainRssMb: 600, rendererHeapMb: 400, growth2to10MinPct: 25 },
};
