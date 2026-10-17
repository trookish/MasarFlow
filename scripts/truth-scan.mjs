#!/usr/bin/env node
// Prints the four feature-truth scans. Evidence tool, not a gate: the gate is
// tests/unit/repo-truth/*.test.ts + tests/unit/lib/plugins-consumers.test.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (["node_modules", ".next", "dist", "out", ".git"].includes(name)) continue;
      walk(full, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

// ROOT is backslash-form on Windows; normalize it before stripping, or every
// path stays absolute and every path-keyed lookup below silently misses.
const rel = (p) => p.replaceAll("\\", "/").replace(ROOT.replaceAll("\\", "/") + "/", "");
const read = (dirs, exts = [".ts", ".tsx"]) =>
  dirs
    .filter((d) => { try { return statSync(path.join(ROOT, d)).isDirectory(); } catch { return false; } })
    .flatMap((d) => walk(path.join(ROOT, d), exts))
    .map((p) => ({ path: rel(p), text: readFileSync(p, "utf8") }));

function plugins() {
  const all = read(["src"]);
  const catalog = all.find((s) => s.path === "src/lib/plugins.ts");
  const ids = [...catalog.text.matchAll(/^    id: "([a-z0-9-]+)",$/gm)].map((m) => m[1]);
  return ids.filter(
    (id) =>
      !all
        .filter((s) => s.path !== "src/lib/plugins.ts")
        .some((s) => s.text.includes(`"${id}"`) || s.text.includes(`'${id}'`)),
  );
}

function apiRoutes() {
  // Same extensions as the guard (tests/unit/repo-truth/dead-routes.test.ts):
  // scripts/*.mjs count as callers.
  const consumers = read(["src", "desktop/src", "scripts"], [".ts", ".tsx", ".mjs"]);
  const dead = [];
  for (const f of consumers.filter((s) => /^src\/app\/api\/.*\/route\.ts$/.test(s.path))) {
    const url = "/" + f.path.slice("src/app/".length, -"/route.ts".length);
    const parent = url.slice(0, url.lastIndexOf("/"));
    const called = consumers.some(
      (s) => s.path !== f.path && (s.text.includes(url) || s.text.includes("`" + parent + "/${")),
    );
    if (!called) dead.push(url);
  }
  return dead;
}

function pages() {
  const base = path.join(ROOT, "src/app/(workspace)");
  const routes = [];
  const rec = (dir, r) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      const next = `${r}/${name}`;
      if (statSync(path.join(full, "page.tsx"), { throwIfNoEntry: false })) routes.push(next);
      rec(full, next);
    }
  };
  rec(base, "");
  const nav = read(["src"]).find((s) => s.path === "src/lib/nav.ts").text;
  const hrefs = [...nav.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  return routes.sort().filter((r) => !hrefs.includes(r));
}

function settings() {
  const all = read(["src"]);
  const store = all.find((s) => s.path === "src/lib/stores/page-settings.ts").text;
  const anchor = store.indexOf("PAGE_SETTINGS_DEFAULTS: AllPageSettings = {");
  const start = store.indexOf("{", anchor);
  let depth = 0, end = -1;
  for (let i = start; i < store.length; i++) {
    if (store[i] === "{") depth++;
    else if (store[i] === "}" && --depth === 0) { end = i + 1; break; }
  }
  const defaults = new Function("return " + store.slice(start, end))();
  const consumers = all.filter(
    (s) => s.path !== "src/lib/stores/page-settings.ts" && !s.path.startsWith("src/components/settings/"),
  );
  const dead = [];
  for (const [group, obj] of Object.entries(defaults)) {
    for (const key of Object.keys(obj)) {
      const hit = consumers.some((s) => new RegExp("\\." + key + "\\b").test(s.text) || new RegExp("\\b" + key + "\\b").test(s.text));
      if (!hit) dead.push(`${group}.${key}`);
    }
  }
  return dead;
}

const report = {
  plugins_without_consumer: plugins(),
  api_routes_without_caller: apiRoutes(),
  workspace_pages_not_in_nav: pages(),
  settings_without_consumer: settings(),
};
console.log(JSON.stringify(report, null, 2));
