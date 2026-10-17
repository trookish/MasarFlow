import { describe, it } from "vitest";
import { readSources, REPO_ROOT } from "../_helpers/fs-scan";
import { expectShrinkingAllowlist } from "../_helpers/shrinking-allowlist";
import { join } from "node:path";

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
