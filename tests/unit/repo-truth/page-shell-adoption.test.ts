import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../_helpers/fs-scan";
import { expectShrinkingAllowlist } from "../_helpers/shrinking-allowlist";

/**
 * Page Shell adoption (UI overhaul P4 to P6): the main view of every workspace page is built from
 * `@/components/page` (PageFrame, PageHeader, Toolbar, Panel, SplitPane, EmptyState, ...).
 *
 * Resolution: a route's `page.tsx` imports one view from `@/components/...`; that view's source file
 * must import `@/components/page`. Surface hosts (`shell/surface-view`) only mount other pages and are
 * exempt; `/today` is mounted by the Today surface directly, so its view is resolved explicitly.
 *
 * The allow-list holds routes not migrated yet. Each migration removes its own line in the same change
 * (a stale entry fails the build too). It must end EMPTY. Adding a route needs a written reason.
 */
const PAGES_NOT_ON_SHELL: string[] = [
  // PAGES_NOT_ON_SHELL:BEGIN (one route per line; remove your own line when you migrate it)
  "/agents",
  "/architecture",
  "/brain",
  "/brain/canvas",
  "/brain/graph",
  "/brain/templates",
  "/chat",
  "/control-center",
  "/dashboard",
  "/devlogs",
  "/docs",
  "/files",
  "/git",
  "/knowledge",
  "/plugins",
  "/search",
  "/settings",
  "/specs",
  "/sprints",
  "/standards",
  "/sync",
  "/today",
  "/tools/logs",
  "/tools/system",
  "/watcher",
  "/workflow",
  // PAGES_NOT_ON_SHELL:END
];

const SURFACE_HOST = "shell/surface-view";
const EXPLICIT_VIEW: Record<string, string> = { "/today": "today/today-view" };

function workspaceRoutes(): Array<{ route: string; pageFile: string }> {
  const base = join(REPO_ROOT, "src/app/(workspace)");
  const out: Array<{ route: string; pageFile: string }> = [];
  const rec = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      const next = `${rel}/${name}`;
      const pageFile = join(full, "page.tsx");
      if (existsSync(pageFile)) out.push({ route: next, pageFile });
      rec(full, next);
    }
  };
  rec(base, "");
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

function viewOf(route: string, pageFile: string): string | null {
  if (EXPLICIT_VIEW[route]) return EXPLICIT_VIEW[route];
  const src = readFileSync(pageFile, "utf8");
  const m = /from\s+"@\/components\/([^"]+)"/.exec(src);
  if (!m) return null;
  return m[1] === SURFACE_HOST ? null : m[1];
}

describe("page shell adoption", () => {
  const routes = workspaceRoutes().map((r) => ({ ...r, view: viewOf(r.route, r.pageFile) }));

  it("every hosted page resolves to a view file", () => {
    const unresolved = routes
      .filter((r) => r.view !== null)
      .filter((r) => !existsSync(join(REPO_ROOT, "src/components", `${r.view}.tsx`)))
      .map((r) => r.route);
    expect(unresolved).toEqual([]);
  });

  it("every page view imports the Page Shell (shrinking allowlist)", () => {
    const missing = routes
      .filter((r) => r.view !== null)
      .filter((r) => !/from\s+"@\/components\/page(\/[^"]*)?"/.test(readFileSync(join(REPO_ROOT, "src/components", `${r.view}.tsx`), "utf8")))
      .map((r) => r.route);
    expectShrinkingAllowlist(missing, PAGES_NOT_ON_SHELL);
  });
});
