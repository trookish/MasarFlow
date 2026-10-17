import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, readSources } from "../_helpers/fs-scan";
import { expectShrinkingAllowlist } from "../_helpers/shrinking-allowlist";

const MATRIX = JSON.parse(
  readFileSync(join(REPO_ROOT, "tests/e2e/feature-matrix.json"), "utf8"),
) as Record<string, string[]>;

function workspaceRoutes(): string[] {
  const base = join(REPO_ROOT, "src/app/(workspace)");
  const routes: string[] = [];
  const rec = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      const next = `${rel}/${name}`;
      if (existsSync(join(full, "page.tsx"))) routes.push(next);
      rec(full, next);
    }
  };
  rec(base, "");
  return routes.sort();
}

/**
 * Routes with no listed features yet (verified 2026-10-17: /settings
 * promoted to real features). Must be [] by P9.
 */
const ROUTES_WITHOUT_FEATURES = [
  "/agents",
  "/architecture",
  "/brain",
  "/brain/canvas",
  "/brain/graph",
  "/brain/templates",
  "/chat",
  "/devlogs",
  "/docs",
  "/files",
  "/knowledge",
  "/search",
  "/specs",
  "/sprints",
  "/standards",
  "/sync",
  "/tasks",
  "/today",
  "/tools/logs",
  "/tools/system",
  "/tools/terminal",
  "/watcher",
  "/workflow",
];

describe("feature matrix", () => {
  it("lists every workspace route and no ghost routes", () => {
    expect(Object.keys(MATRIX).sort()).toEqual(workspaceRoutes());
  });

  it("every route has at least one feature (shrinking allowlist)", () => {
    const empty = Object.entries(MATRIX)
      .filter(([, features]) => features.length === 0)
      .map(([route]) => route);
    expectShrinkingAllowlist(empty, ROUTES_WITHOUT_FEATURES);
  });

  it('every feature has a Playwright test titled "<route>: <feature>"', () => {
    const specs = readSources(join(REPO_ROOT, "tests/e2e"), [".spec.ts"]);
    const missing: string[] = [];
    for (const [route, features] of Object.entries(MATRIX)) {
      for (const feature of features) {
        const title = `${route}: ${feature}`;
        if (!specs.some((s) => s.text.includes(title))) missing.push(title);
      }
    }
    expect(missing).toEqual([]);
  });
});
