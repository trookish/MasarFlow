import { describe, it, expect } from "vitest";
import { readSources, REPO_ROOT } from "../_helpers/fs-scan";
import { expectShrinkingAllowlist } from "../_helpers/shrinking-allowlist";
import { join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { PAGE_PATHS } from "@/lib/dock/registry";
import { SURFACES, SURFACE_ROUTES } from "@/lib/navigation/surfaces";

/**
 * Dead routes: API route files nothing in the app calls.
 *
 * "Called" = a source under src/, desktop/src/ or scripts/ contains the route's
 * literal URL path, or a template-literal prefix that can produce it
 * (`/api/fs/${op}`). tests/ is excluded: a test importing a handler must not
 * keep a dead route alive.
 *
 * The allow-list entered P9 with the four /api/python/{analyze,parse,git,graph}
 * proxies and is empty because P3 deleted them. It must stay empty.
 *
 * Mutation-proved (T3): a probe route with no caller fails with
 * `fresh: ["/api/t3-probe"]`, and a fake allow-list entry fails with
 * `stale: ["/api/nope"]` — an empty list here is a real claim, not a vacuous
 * pass.
 */
const DEAD_ROUTES: string[] = [];

/**
 * No exceptions list by design: a route whose only caller is outside this repo
 * must still be called by something in the repo (the desktop main process, a
 * script, a generated-tool template). If a genuinely external caller ever
 * appears, add it here WITH the reason in the same commit — never widen this
 * test to make a route pass.
 */

function routeUrlOf(path: string): string {
  return "/" + path.slice("src/app/".length, -"/route.ts".length);
}

function callers(url: string, sources: { path: string; text: string }[], self: string): string[] {
  const parent = url.slice(0, url.lastIndexOf("/"));
  return sources
    .filter((s) => s.path !== self)
    .filter((s) => s.text.includes(url) || s.text.includes("`" + parent + "/${"))
    .map((s) => s.path);
}

describe("api routes have callers", () => {
  it("no route file is unused (shrinking allowlist)", () => {
    const app = readSources(join(REPO_ROOT, "src"));
    const others = [
      ...readSources(join(REPO_ROOT, "desktop", "src")),
      ...readSources(join(REPO_ROOT, "scripts"), [".ts", ".mjs"]),
    ].filter((s) => s.path !== "src/lib/plugins.ts");
    const sources = [...app.filter((s) => !s.path.startsWith("tests/")), ...others];

    const routeFiles = app.filter((s) => /^src\/app\/api\/.*\/route\.ts$/.test(s.path));
    const dead = routeFiles
      .map((f) => routeUrlOf(f.path))
      .filter((url) => callers(url, sources, "src/app" + url + "/route.ts").length === 0)
      .sort();

    expectShrinkingAllowlist(dead, DEAD_ROUTES);
  });
});

/**
 * Page-caller guard (P9.T4): the other half of "no route without a caller".
 *
 * - an orphan page (a page.tsx no nav entry points at) can never be reached:
 *   the sidebar, the dock and the palette all render from ALL_NAV_ITEMS;
 * - a ghost nav entry (a link with no page file behind it) is a 404.
 *
 * nav-parity.test.ts (P8) asserts nav → dock membership through PAGE_PATHS;
 * this guard scans the filesystem directly, so a page added to the tree
 * without a nav entry fails here even if PAGE_PATHS is never touched.
 */
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

describe("workspace pages are reachable", () => {
  it("every page is a dock page or a surface (no orphan route)", () => {
    const orphans = workspaceRoutes().filter((r) => !PAGE_PATHS.includes(r) && !SURFACE_ROUTES.has(r));
    expect(orphans).toEqual([]);
  });

  it("every surface has a page and every section hosts a dock page", () => {
    const routes = workspaceRoutes();
    for (const s of SURFACES) {
      expect(routes, s.route).toContain(s.route);
      for (const x of s.sections) expect(PAGE_PATHS, `${s.id}.${x.id}`).toContain(x.href);
    }
  });

  it("every nav entry has a page (no ghost link)", () => {
    const missing = ALL_NAV_ITEMS.map((i) => i.href).filter(
      (href) => !workspaceRoutes().includes(href),
    );
    expect(missing).toEqual([]);
  });

  it("PAGE_PATHS covers every surface and hosted legacy page", () => {
    const expected = [
      ...new Set([
        ...SURFACES.map((surface) => surface.route),
        ...ALL_NAV_ITEMS.map((item) => item.href),
      ]),
    ].sort();
    expect(PAGE_PATHS.slice().sort()).toEqual(expected);
  });
});
