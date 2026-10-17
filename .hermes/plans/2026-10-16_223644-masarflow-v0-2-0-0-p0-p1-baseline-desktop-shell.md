# MasarFlow v0.2.0.0 — Phases P0 + P1: Baseline, Guards, Spikes, Desktop Shell

> **For Hermes:** read `…-masarflow-v0-2-0-0-master.md` first (decisions D1–D12, conventions §6).
> Execute task-by-task with `subagent-driven-development`. Commit after every task. Do not push.

**Goal of P0+P1:** a recorded baseline, three guard tests that make fake features impossible to hide, three go/no-go spikes that de-risk the architecture, then a single Electron app that boots the workspace from `masarflow://app` and passes a packaged-build smoke test.

**Architecture (this file):** Next `standalone` server runs in an Electron `utilityProcess` on a random loopback port with a per-launch token; `protocol.handle("masarflow")` proxies to it so the page origin is constant (IndexedDB survives restarts).

**Exit gate (P1):** `node scripts/smoke-desktop.mjs` prints `SMOKE_OK` against `desktop/dist/win-unpacked/MasarFlow.exe`; `pnpm test`, `pnpm typecheck`, `pnpm desktop:typecheck` green.

---

# PHASE 0 — Baseline, guards, spikes

## P0.T1 — Branch and baseline (≈3 min)

**Files:** create `.hermes/baseline/v0.1.5.1.md`.

```bash
cd /c/Users/trookish/Dev/Web-Projects/MasarFlow
git status --short            # expect: clean or only .hermes/plans untracked
git switch -c release/v0.2.0
mkdir -p .hermes/baseline
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -12
pnpm test 2>&1 | tail -15
pnpm desktop:typecheck 2>&1 | tail -5
```

Expected: `typecheck` prints only `$ tsc --noEmit`; `lint` reports `0 errors, 4 warnings` (all `@next/next/no-img-element`, in `project-fields.tsx` ×3 and `dashboard-view.tsx` ×1); `test` ends with a pass summary (**record the exact "Tests N passed" number**); `desktop:typecheck` exits 0.

Write the four results (verbatim last lines + the test count + date) into `.hermes/baseline/v0.1.5.1.md`, then:

```bash
git add .hermes/baseline .hermes/plans && git commit -m "chore(release): branch v0.2.0 and record v0.1.5.1 baseline"
```

If any command is red on a clean tree, **stop and report** — do not start P0.T2 on a red baseline.

## P0.T2 — Shrinking-allowlist helper + plugin-consumer guard (TDD, ≈5 min)

Purpose: tests that fail when *new* fakes appear **and** when old debt is fixed but still listed. Allowlists must reach `[]` in P9.

**Create `tests/unit/_helpers/shrinking-allowlist.ts`:**

```ts
import { expect } from "vitest";

/**
 * Debt that may exist today but must never grow and must never go stale.
 * Fails on a NEW violation (not in `allowed`) and on a STALE entry
 * (listed in `allowed` but no longer a violation) so the list shrinks as
 * debt is paid. Remove entries from the caller's list; never add to it
 * without a written reason in the commit message.
 */
export function expectShrinkingAllowlist(actual: string[], allowed: string[]): void {
  const found = new Set(actual);
  const known = new Set(allowed);
  const fresh = [...found].filter((v) => !known.has(v)).sort();
  const stale = [...known].filter((v) => !found.has(v)).sort();
  expect({ fresh, stale }).toEqual({ fresh: [], stale: [] });
}
```

**Create `tests/unit/_helpers/fs-scan.ts`:**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const SRC_DIR = join(REPO_ROOT, "src");

export function* walk(dir: string, exts = [".ts", ".tsx"]): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      yield* walk(full, exts);
    } else if (exts.some((e) => name.endsWith(e))) {
      yield full;
    }
  }
}

export interface SourceFile {
  /** Repo-relative, forward slashes, e.g. "src/lib/plugins.ts". */
  path: string;
  text: string;
}

export function readSources(dir = SRC_DIR, exts?: string[]): SourceFile[] {
  return [...walk(dir, exts)].map((p) => ({
    path: p.slice(REPO_ROOT.length).replaceAll("\\", "/"),
    text: readFileSync(p, "utf8"),
  }));
}
```

**Create `tests/unit/lib/plugins-consumers.test.ts`:**

```ts
import { describe, it } from "vitest";
import { PLUGIN_CATALOG } from "@/lib/plugins";
import { readSources } from "../_helpers/fs-scan";
import { expectShrinkingAllowlist } from "../_helpers/shrinking-allowlist";

/** Catalog plugins nothing consumes (verified 2026-10-16). Must be [] by P9. */
const UNWIRED_PLUGINS = [
  "canvas-ai-assist",
  "canvas-collab",
  "canvas-mermaid",
  "github-commits",
  "obsidian-sync",
];

describe("plugin catalog is real", () => {
  it("every catalog plugin id is referenced outside the catalog", () => {
    const sources = readSources().filter((s) => s.path !== "src/lib/plugins.ts");
    const unwired = PLUGIN_CATALOG.filter(
      (p) => !sources.some((s) => s.text.includes(`"${p.id}"`) || s.text.includes(`'${p.id}'`)),
    ).map((p) => p.id);
    expectShrinkingAllowlist(unwired, UNWIRED_PLUGINS);
  });
});
```

**Run (expect PASS — it is a characterization of today's debt):**

```bash
pnpm test -- tests/unit/lib/plugins-consumers.test.ts
```
Expected: `1 passed`. If the diff shows a *different* set than the five above, the test output is the truth: update `UNWIRED_PLUGINS`, and note the delta in the commit message.

**Mutation check (proves the guard bites):** delete `"obsidian-sync"` from `UNWIRED_PLUGINS`, rerun → expect FAIL with `fresh: ["obsidian-sync"]`; restore the line.

```bash
git add tests/unit && git commit -m "test(guard): plugin catalog entries must have a consumer (shrinking allowlist)"
```

## P0.T3 — Feature-matrix skeleton + guard (TDD, ≈5 min)

**Create `tests/e2e/feature-matrix.json`** — every workspace route present, features empty (P9 fills them):

```json
{
  "/agents": [],
  "/architecture": [],
  "/brain": [],
  "/brain/canvas": [],
  "/brain/graph": [],
  "/brain/templates": [],
  "/chat": [],
  "/dashboard": [],
  "/devlogs": [],
  "/docs": [],
  "/files": [],
  "/knowledge": [],
  "/plugins": [],
  "/search": [],
  "/settings": [],
  "/specs": [],
  "/sprints": [],
  "/standards": [],
  "/sync": [],
  "/tasks": [],
  "/watcher": [],
  "/workflow": []
}
```

**Create `tests/unit/e2e/feature-matrix.test.ts`:**

```ts
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

/** Routes with no listed features yet. Must be [] by P9. */
const ROUTES_WITHOUT_FEATURES = Object.keys(MATRIX).sort();

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
```

Run: `pnpm test -- tests/unit/e2e/feature-matrix.test.ts` → expect `3 passed`. If test 1 fails, the diff names the route that is missing/extra — fix the JSON (the directory scan is the truth).

Mutation check: add `"/tasks": ["ghost feature"]` → test 3 must FAIL listing `/tasks: ghost feature`; revert.

```bash
git add tests && git commit -m "test(guard): feature matrix must cover every route and be backed by e2e titles"
```

## P0.T4 — Spike S1: Next standalone + pnpm + electron-builder on Windows (≈15 min, throwaway)

**Question:** can we produce a self-contained server folder (no `node_modules` install on the user's machine) and bundle it?
**Branch:** `git switch -c spike/s1-standalone` from `release/v0.2.0`. Results go to `.hermes/spikes/S1.md` on `release/v0.2.0` (copy the file over; discard the rest).

1. Edit `next.config.ts` to exactly:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (multiple lockfiles exist on the
  // machine, which otherwise makes Turbopack infer the wrong root).
  turbopack: { root: import.meta.dirname },
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  outputFileTracingExcludes: {
    "*": [
      "desktop/**",
      "python-service/**",
      ".hermes/**",
      "release/**",
      "tests/**",
      "test-results/**",
      ".opencode/**",
      ".masarflow/**",
    ],
  },
};

export default nextConfig;
```
Check `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` for the exact `outputFileTracingExcludes` key semantics; if `"*"` is not accepted, use the documented route-glob form.

2. Build and assemble:

```bash
pnpm build 2>&1 | tail -20
ls .next/standalone/server.js
du -sm .next/standalone
```
3. Run it like the app will (copy static + public first):

```bash
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/static
(PORT=3123 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/s1.log 2>&1 &) ; sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3123/dashboard
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3123/_next/static/chunks/ -I
```
4. Prove it is self-contained and lean:

```bash
test ! -d .next/standalone/python-service && test ! -d .next/standalone/desktop && echo "no sidecar/desktop traced"
find .next/standalone -type l | head -5      # symlinks present? (pnpm)
```
5. Prove electron-builder can carry it: copy to `desktop/app-server/` with `node -e "require('fs').cpSync('.next/standalone','desktop/app-server',{recursive:true,dereference:true})"`, add `extraResources: [{from: app-server, to: app-server}]` to `desktop/electron-builder.yml`, run `pnpm --dir desktop exec electron-builder --win --dir`, then `ls desktop/dist/win-unpacked/resources/app-server/server.js`.

**GO criteria (all):** `/dashboard` → `200`; `.next/standalone` ≤ 400 MB; no `python-service`/`desktop` inside; `server.js` present in the unpacked `resources/app-server`; copying with `dereference:true` works.
**NO-GO fallbacks, in order:** (a) add `node-linker=hoisted` in a **build-only** `.npmrc` and rebuild; (b) `pnpm deploy --prod` the web app to a temp dir; (c) stop and report.
Record numbers (size, file count, build time) in `.hermes/spikes/S1.md`. Delete the spike branch's `desktop/app-server` and `.next/standalone/public` copies (they are build output).

## P0.T5 — Spike S2: `masarflow://` proxy — streaming, redirect, stable origin (≈20 min, throwaway)

**Question:** does an Electron 43 `protocol.handle` proxy keep SSE incremental, follow redirects, carry large POST bodies, and keep IndexedDB across restarts when the server port changes?

Create `.hermes/spikes/s2/` (do not commit `node_modules`).

**`.hermes/spikes/s2/server.cjs`** (stand-in for Next):

```js
const http = require("node:http");
const port = Number(process.argv[2]);
const token = process.env.MASARFLOW_TOKEN;
http
  .createServer((req, res) => {
    if (req.headers["x-masarflow-token"] !== token) { res.writeHead(401).end("no token"); return; }
    if (req.url === "/") { res.writeHead(307, { location: "/dashboard" }).end(); return; }
    if (req.url === "/dashboard") {
      res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>s2</title><body>ok</body>");
      return;
    }
    if (req.url === "/sse") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      let n = 0;
      const t = setInterval(() => { res.write(`data: ${++n}\n\n`); if (n === 5) { clearInterval(t); res.end(); } }, 250);
      return;
    }
    if (req.url === "/echo" && req.method === "POST") {
      let size = 0; req.on("data", (c) => (size += c.length)); req.on("end", () => res.writeHead(200).end(String(size)));
      return;
    }
    res.writeHead(404).end();
  })
  .listen(port, "127.0.0.1");
```

**`.hermes/spikes/s2/main.cjs`:**

```js
const { app, BrowserWindow, protocol, net } = require("electron");
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const path = require("node:path");

protocol.registerSchemesAsPrivileged([
  { scheme: "masarflow", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

app.whenReady().then(async () => {
  const port = 41000 + Math.floor(Math.random() * 1000); // different every run on purpose
  const token = "tok-" + Math.random().toString(16).slice(2);
  // Plain `node` from PATH (Electron's own binary cannot run a script without ELECTRON_RUN_AS_NODE).
  const child = spawn("node", [path.join(__dirname, "server.cjs"), String(port)], {
    env: { ...process.env, MASARFLOW_TOKEN: token }, stdio: "ignore",
  });
  child.on("error", () => {});
  await new Promise((r) => setTimeout(r, 800));

  protocol.handle("masarflow", (request) => {
    const u = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set("x-masarflow-token", token);
    return net.fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, {
      method: request.method, headers, body: request.body, duplex: "half", redirect: "manual",
      bypassCustomProtocolHandlers: true,
    });
  });

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadURL("masarflow://app/");
  const result = await win.webContents.executeJavaScript(`(async () => {
    const out = { path: location.pathname, origin: location.origin };
    const db = await new Promise((res, rej) => { const r = indexedDB.open("s2", 1); r.onupgradeneeded = () => r.result.createObjectStore("k"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const prev = await new Promise((res) => { const q = db.transaction("k").objectStore("k").get("n"); q.onsuccess = () => res(q.result || 0); });
    await new Promise((res) => { const t = db.transaction("k", "readwrite"); t.objectStore("k").put(prev + 1, "n"); t.oncomplete = res; });
    out.counter = prev + 1;
    const t0 = performance.now(); const stamps = [];
    const rd = (await fetch("/sse")).body.getReader(); const dec = new TextDecoder();
    for (;;) { const { done, value } = await rd.read(); if (done) break; if (dec.decode(value).includes("data:")) stamps.push(Math.round(performance.now() - t0)); }
    out.sseStamps = stamps;
    const big = new Uint8Array(1024 * 1024);
    out.echo = Number(await (await fetch("/echo", { method: "POST", body: big })).text());
    return out;
  })()`);
  writeFileSync(process.env.S2_OUT, JSON.stringify({ port, ...result }));
  child.kill(); app.exit(0);
});
```

Run twice (`node` must be on PATH; `pnpm exec playwright install chromium` is NOT needed here — this spike uses Electron only):

```bash
cd .hermes/spikes/s2
S2_OUT=$PWD/run1.json ../../../desktop/node_modules/.bin/electron main.cjs
S2_OUT=$PWD/run2.json ../../../desktop/node_modules/.bin/electron main.cjs
cat run1.json run2.json
```

**GO criteria (all):** `path === "/dashboard"` (redirect followed) · `origin === "masarflow://app"` · `echo === 1048576` · SSE stamps has 5 entries and `stamps[0] < 600` and `stamps[4] - stamps[0] >= 700` (incremental, not buffered) · `run1.counter === 1` and `run2.counter === 2` **with different `port` values** (origin stable → IndexedDB persisted).
**NO-GO fallback:** fixed per-install port stored in settings (document origin-drift risk R2) — report to the owner before continuing; P1.T4 changes accordingly.
Write results into `.hermes/spikes/S2.md`.

## P0.T6 — Spike S3: in-browser embeddings under the real CSP (≈25 min, throwaway)

**Question:** can `@huggingface/transformers` run `all-MiniLM-L6-v2` (q8) from local files, offline, under the app's CSP, fast enough?

1. Create **`scripts/fetch-embedding-model.mjs`** (kept; reused by P3):

```js
#!/usr/bin/env node
// Downloads the quantized embedding model into public/models/ (gitignored).
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "Xenova/all-MiniLM-L6-v2";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];

for (const f of FILES) {
  const dest = path.join(root, "public", "models", MODEL, f);
  if (existsSync(dest)) { console.log("have", f); continue; }
  mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(`https://huggingface.co/${MODEL}/resolve/main/${f}`);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status} — check https://huggingface.co/${MODEL}/tree/main`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  const sha = createHash("sha256").update(readFileSync(dest)).digest("hex").slice(0, 16);
  console.log("got", f, sha);
}
```
Add `/public/models/` to `.gitignore`. Run `pnpm add @huggingface/transformers` and `node scripts/fetch-embedding-model.mjs`.

2. **`.hermes/spikes/s3/run.mjs`** (Playwright's bundled Chromium = same Blink/V8 family as Electron):

```js
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "../../..");
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'";
const map = {
  "/index.html": null,
  "/tf.js": path.join(root, "node_modules/@huggingface/transformers/dist/transformers.web.js"),
};
const ortDir = path.join(root, "node_modules/onnxruntime-web/dist");
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  res.setHeader("Content-Security-Policy", CSP);
  if (url === "/index.html") { res.setHeader("content-type", "text/html"); res.end('<script type="module" src="/page.js"></script>'); return; }
  if (url === "/page.js") { res.setHeader("content-type", "text/javascript"); createReadStream(path.join(import.meta.dirname, "page.js")).pipe(res); return; }
  let file = map[url];
  if (!file && url.startsWith("/ort/")) file = path.join(ortDir, url.slice(5));
  if (!file && url.startsWith("/models/")) file = path.join(root, "public", url);
  if (file && existsSync(file) && statSync(file).isFile()) {
    res.setHeader("content-type", file.endsWith(".js") || file.endsWith(".mjs") ? "text/javascript" : file.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
    createReadStream(file).pipe(res); return;
  }
  res.statusCode = 404; res.end();
}).listen(4399);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://127.0.0.1:4399/index.html");
const result = await page.waitForFunction(() => window.__s3, null, { timeout: 180_000 }).then((h) => h.jsonValue());
console.log(JSON.stringify(result, null, 2));
await browser.close(); server.close();
```

**`.hermes/spikes/s3/page.js`:**

```js
import { pipeline, env } from "/tf.js";
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.backends.onnx.wasm.wasmPaths = "/ort/";
env.backends.onnx.wasm.numThreads = 1; // no COOP/COEP => no SharedArrayBuffer

const t0 = performance.now();
const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8", device: "wasm" });
const loadMs = Math.round(performance.now() - t0);

const para = "MasarFlow stores every project note locally and links tasks, specs and commits into one graph. ".repeat(8);
const texts = Array.from({ length: 50 }, (_, i) => `${i}: ${para}`);
const t1 = performance.now();
const out = await extractor(texts, { pooling: "mean", normalize: true });
const embedMs = Math.round(performance.now() - t1);

const q = await extractor(["How do I plan a sprint for my game?", "Sprint planning for a video game project", "Recipe for chocolate cake with eggs"], { pooling: "mean", normalize: true });
const v = q.tolist();
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
window.__s3 = { loadMs, embedMs, perChunkMs: Math.round(embedMs / 50), dims: out.dims, related: dot(v[0], v[1]), unrelated: dot(v[0], v[2]) };
```

Run: `node .hermes/spikes/s3/run.mjs`. If `transformers.web.js` is not at that path, `ls node_modules/@huggingface/transformers/dist` and use the browser ESM bundle that exists; same for `node_modules/onnxruntime-web/dist` (the `.wasm`/`.mjs` pair the runtime requests — a 404 in the log tells you which file to serve).

**GO criteria:** `dims` = `[50, 384]` · `perChunkMs ≤ 400` (50 chunks ≤ 20 s) · `related - unrelated ≥ 0.2` · no CSP violation in the `[page]` log · works with `connect-src 'self'` only (proves fully offline).
**NO-GO fallbacks:** (a) raise to `device: "webgpu"` if available; (b) move embedding into the server `utilityProcess` with `onnxruntime-node` (adds ~100 MB native binary per platform); (c) keep the Python sidecar as optional-advanced and make semantic search degrade to Fuse-only (report to owner).
Record in `.hermes/spikes/S3.md`.

## P0.T7 — Spike verdicts gate (≈3 min)

Write `.hermes/spikes/VERDICT.md` with one line per spike: `S1 GO|NO-GO (fallback used)`, `S2 …`, `S3 …` plus the measured numbers. Commit all three `.md` files (no spike code, no binaries) to `release/v0.2.0`:

```bash
git switch release/v0.2.0
git add .hermes/spikes/*.md scripts/fetch-embedding-model.mjs .gitignore && git commit -m "docs(spike): S1 standalone, S2 scheme proxy, S3 wasm embeddings verdicts"
```
**P1 may start only when S1 and S2 are GO (or their documented fallbacks were accepted by the owner). S3 gates P3 only.**

---

# PHASE 1 — Desktop shell

> Verify every Electron symbol against `desktop/node_modules/electron/electron.d.ts` before using it.
> Main-process modules that contain logic must not import `electron` at module top-level unless they need it, so vitest (node env) can import them.

## P1.T1 — Test aliases + pure modules: token, ports, URL policy (TDD, ≈8 min)

**1. Edit `tests/vitest.config.ts`** to:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      // `@shared` is the name the Electron code itself uses (see desktop/electron.vite.config.ts),
      // `@desktop-shared` is the name the Next app uses (root tsconfig). Same folder.
      "@desktop-shared": fileURLToPath(new URL("../desktop/src/shared", import.meta.url)),
      "@shared": fileURLToPath(new URL("../desktop/src/shared", import.meta.url)),
      "@desktop": fileURLToPath(new URL("../desktop/src/main", import.meta.url)),
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
});
```

This file already exists with only the `@` alias — the block above is the full new content (verified identical apart from the three added aliases). Vite string aliases match `key` or `key/…` only, so `@` does not swallow `@shared/…`.

**2. Write the failing tests first.**

`tests/unit/desktop/token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createLaunchToken, tokensMatch } from "@desktop/backend/token";

describe("launch token", () => {
  it("is 64 hex chars and unique per call", () => {
    const a = createLaunchToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(createLaunchToken()).not.toBe(a);
  });

  it("matches only the identical token", () => {
    const t = createLaunchToken();
    const wrong = t.slice(0, -1) + (t.endsWith("a") ? "b" : "a");
    expect(tokensMatch(t, t)).toBe(true);
    expect(tokensMatch(t, wrong)).toBe(false);
    expect(tokensMatch(t, `${t}x`)).toBe(false);
    expect(tokensMatch(t, "")).toBe(false);
    expect(tokensMatch(t, null)).toBe(false);
    expect(tokensMatch(t, undefined)).toBe(false);
  });

  it("never matches when the expected token is empty", () => {
    expect(tokensMatch("", "")).toBe(false);
  });
});
```

`tests/unit/desktop/url-policy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isInternalUrl, isSafeExternalUrl } from "@desktop/security/url-policy";

describe("isInternalUrl", () => {
  it("accepts only the app origin", () => {
    expect(isInternalUrl("masarflow://app/dashboard")).toBe(true);
    expect(isInternalUrl("masarflow://app")).toBe(true);
    expect(isInternalUrl("masarflow://evil/dashboard")).toBe(false);
    expect(isInternalUrl("https://github.com/trookish")).toBe(false);
    expect(isInternalUrl("file:///c:/Windows/win.ini")).toBe(false);
    expect(isInternalUrl("not a url")).toBe(false);
  });
  it("accepts the dev server origin only when provided", () => {
    expect(isInternalUrl("http://localhost:3000/chat")).toBe(false);
    expect(isInternalUrl("http://localhost:3000/chat", "http://localhost:3000")).toBe(true);
    expect(isInternalUrl("http://localhost:3001/chat", "http://localhost:3000")).toBe(false);
  });
});

describe("isSafeExternalUrl", () => {
  it("allows only http, https and mailto", () => {
    expect(isSafeExternalUrl("https://github.com")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:11434")).toBe(true);
    expect(isSafeExternalUrl("mailto:a@b.co")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("file:///c:/x")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<b>x</b>")).toBe(false);
    expect(isSafeExternalUrl("masarflow://app/x")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
  });
});
```

`tests/unit/desktop/ports.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "node:net";
import { findFreePort } from "@desktop/backend/ports";

describe("findFreePort", () => {
  it("returns a loopback port that can be bound immediately", async () => {
    const port = await findFreePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(1023);
    await new Promise<void>((resolve, reject) => {
      const s = createServer();
      s.once("error", reject);
      s.listen(port, "127.0.0.1", () => s.close(() => resolve()));
    });
  });
});
```

**3. Run — expect FAIL** (`Failed to resolve import "@desktop/backend/token"`):

```bash
pnpm test -- tests/unit/desktop
```

**4. Implement.**

`desktop/src/main/backend/token.ts`:

```ts
import { randomBytes, timingSafeEqual } from "node:crypto";

/** Per-launch secret shared by main and the embedded server only. */
export function createLaunchToken(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time compare; an empty expected token never matches. */
export function tokensMatch(expected: string, actual: string | null | undefined): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

`desktop/src/main/backend/ports.ts`:

```ts
import { createServer } from "node:net";

/** Ask the OS for a free port on the loopback interface. */
export function findFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error("Could not determine a free port"));
      }
    });
  });
}
```

`desktop/src/main/security/url-policy.ts`:

```ts
/** URLs the main window may stay on. Everything else is blocked or sent to the OS browser. */
export function isInternalUrl(raw: string, devOrigin?: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol === "masarflow:" && u.host === "app") return true;
    if (devOrigin) return u.origin === new URL(devOrigin).origin;
    return false;
  } catch {
    return false;
  }
}

/** Only http(s) and mailto may be handed to the OS. */
export function isSafeExternalUrl(raw: string): boolean {
  try {
    const p = new URL(raw).protocol;
    return p === "https:" || p === "http:" || p === "mailto:";
  } catch {
    return false;
  }
}
```

**5. Run — expect PASS** (`3 test files passed`), then:

```bash
git add tests desktop/src/main && git commit -m "feat(desktop): launch token, free-port finder and URL policy (pure, tested)"
```

## P1.T2 — Shared contract: constants, channels, API type, preload (≈6 min)

**Create `desktop/src/shared/security.ts`:**

```ts
export const APP_SCHEME = "masarflow";
export const APP_HOST = "app";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const TOKEN_HEADER = "x-masarflow-token";
```

**Create `desktop/src/shared/channels.ts`:**

```ts
/** Every IPC channel name. New phases append here — never inline strings. */
export const CH = {
  appInfo: "app:info",
  appOpenLogs: "app:open-logs",
  appRelaunch: "app:relaunch",
  dialogChooseFolder: "dialog:choose-folder",
  shellOpenExternal: "shell:open-external",
  shellShowItem: "shell:show-item",
  clipboardWrite: "clipboard:write-text",
  clipboardRead: "clipboard:read-text",
  winMinimize: "window:minimize",
  winToggleMax: "window:toggle-maximize",
  winClose: "window:close",
  winIsMax: "window:is-maximized",
  winMaximized: "window:maximized",
} as const;
```

**Create `desktop/src/shared/api.ts`:**

```ts
/** The renderer-facing API exposed as `window.masarflow` by the preload script. */
export interface MasarflowApi {
  platform: NodeJS.Platform;
  app: {
    info(): Promise<{ version: string; displayVersion: string; userData: string; packaged: boolean }>;
    openLogs(): Promise<void>;
    relaunch(): void;
  };
  dialog: {
    /** Native folder picker. Returns the absolute path or null when cancelled. */
    chooseFolder(): Promise<string | null>;
  };
  shell: {
    openExternal(url: string): Promise<void>;
    showItemInFolder(path: string): void;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
    readText(): Promise<string>;
  };
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximized(cb: (maximized: boolean) => void): () => void;
  };
}
```

**Replace `desktop/src/preload/index.ts`** entirely:

```ts
import { contextBridge, ipcRenderer } from "electron";
import { CH } from "@shared/channels";
import type { MasarflowApi } from "@shared/api";

const api: MasarflowApi = {
  platform: process.platform,
  app: {
    info: () => ipcRenderer.invoke(CH.appInfo),
    openLogs: () => ipcRenderer.invoke(CH.appOpenLogs),
    relaunch: () => ipcRenderer.send(CH.appRelaunch),
  },
  dialog: { chooseFolder: () => ipcRenderer.invoke(CH.dialogChooseFolder) },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(CH.shellOpenExternal, url),
    showItemInFolder: (p) => ipcRenderer.send(CH.shellShowItem, p),
  },
  clipboard: {
    writeText: (t) => ipcRenderer.invoke(CH.clipboardWrite, t),
    readText: () => ipcRenderer.invoke(CH.clipboardRead),
  },
  window: {
    minimize: () => ipcRenderer.send(CH.winMinimize),
    toggleMaximize: () => ipcRenderer.send(CH.winToggleMax),
    close: () => ipcRenderer.send(CH.winClose),
    isMaximized: () => ipcRenderer.invoke(CH.winIsMax),
    onMaximized: (cb) => {
      const listener = (_e: unknown, v: boolean): void => cb(v);
      ipcRenderer.on(CH.winMaximized, listener);
      return () => ipcRenderer.removeListener(CH.winMaximized, listener);
    },
  },
};

contextBridge.exposeInMainWorld("masarflow", api);
```

Delete `desktop/src/preload/index.d.ts` (the old `window.api` typing). The `@shared` alias already exists in `desktop/electron.vite.config.ts` and `tsconfig.node.json`.

Commit: `git add desktop && git commit -m "feat(desktop): shared IPC contract and new preload (window.masarflow)"`. (`desktop:typecheck` is expected to be red until P1.T6 removes the old renderer — do not run it yet.)

## P1.T3 — Next side: standalone output, health route, assembler script (≈8 min)

**Needs S1 = GO.** Apply the `next.config.ts` from P0.T4 (if the spike branch was discarded, re-apply it).

**Failing test first — `tests/unit/api/health.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports ok and the build version", async () => {
    process.env.MASARFLOW_VERSION = "9.9.9-test";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "9.9.9-test" });
  });
});
```
Run → FAIL (module not found). **Create `src/app/api/health/route.ts`:**

```ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness probe used by the Electron main process to know the server is up. */
export async function GET(): Promise<Response> {
  return Response.json({ ok: true, version: process.env.MASARFLOW_VERSION ?? "dev" });
}
```
Run → PASS.

**Create `scripts/build-app-server.mjs`:**

```js
#!/usr/bin/env node
// Assembles desktop/app-server from the Next standalone output so
// electron-builder can ship it as an extraResource.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const out = path.join(root, "desktop", "app-server");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("Missing .next/standalone/server.js — run `pnpm build` first (needs output: 'standalone').");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
// dereference: pnpm's node_modules are symlinks; electron-builder cannot carry them on Windows.
cpSync(standalone, out, { recursive: true, dereference: true });
mkdirSync(path.join(out, ".next"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
console.log("app-server ready:", out);
```

**Edit root `package.json` scripts** (replace the `desktop:*` and add):

```json
"build:app": "next build && node scripts/build-app-server.mjs",
"dev:desktop": "node scripts/dev-desktop.mjs",
"desktop:dist": "pnpm build:app && pnpm --dir desktop run dist",
"desktop:dist:dir": "pnpm build:app && pnpm --dir desktop run dist:dir",
"smoke:desktop": "node scripts/smoke-desktop.mjs"
```
Keep `desktop:typecheck`. Add `/desktop/app-server/` to `.gitignore`.

Run and verify:

```bash
pnpm test -- tests/unit/api/health.test.ts      # PASS
pnpm build:app 2>&1 | tail -5                    # expect: app-server ready: ...\desktop\app-server
ls desktop/app-server/server.js desktop/app-server/.next/static | head -3
```
Commit: `feat(build): standalone output, /api/health and app-server assembler`.

## P1.T4 — Backend process manager + scheme proxy (≈10 min)

**Needs S2 = GO.** Re-open the S2 spike results: reuse exactly the `net.fetch` options that passed.

**Create `desktop/src/main/backend/server.ts`:**

```ts
import { utilityProcess } from "electron";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TOKEN_HEADER } from "@shared/security";
import { findFreePort } from "./ports";
import { createLaunchToken } from "./token";

export interface BackendHandle {
  origin: string;
  port: number;
  token: string;
  stop(): Promise<void>;
}

export interface StartBackendOptions {
  /** Absolute path to the Next standalone server.js. */
  serverEntry: string;
  logDir: string;
  env?: Record<string, string>;
  readyTimeoutMs?: number;
}

/** Fork the Next standalone server on a free loopback port and wait for /api/health. */
export async function startBackend(opts: StartBackendOptions): Promise<BackendHandle> {
  const port = await findFreePort();
  const token = createLaunchToken();
  const origin = `http://127.0.0.1:${port}`;

  mkdirSync(opts.logDir, { recursive: true });
  const log = createWriteStream(join(opts.logDir, "server.log"), { flags: "a" });
  const tail: string[] = [];
  const onData = (chunk: Buffer): void => {
    const text = chunk.toString();
    log.write(text);
    tail.push(...text.split(/\r?\n/).filter(Boolean));
    if (tail.length > 60) tail.splice(0, tail.length - 60);
  };

  const child = utilityProcess.fork(opts.serverEntry, [], {
    serviceName: "masarflow-server",
    stdio: "pipe",
    env: {
      ...(process.env as Record<string, string>),
      ...opts.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      MASARFLOW_TOKEN: token,
    },
  });
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  let exitCode: number | null = null;
  child.once("exit", (code) => {
    exitCode = code;
  });

  const deadline = Date.now() + (opts.readyTimeoutMs ?? 30_000);
  for (;;) {
    if (exitCode !== null) {
      throw new Error(`Backend exited with code ${exitCode} before it was ready.\n${tail.join("\n")}`);
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`Backend did not become ready in time.\n${tail.join("\n")}`);
    }
    try {
      const res = await fetch(`${origin}/api/health`, {
        headers: { [TOKEN_HEADER]: token },
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) break;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    origin,
    port,
    token,
    async stop() {
      if (exitCode === null) {
        await new Promise<void>((resolve) => {
          child.once("exit", () => resolve());
          child.kill();
        });
      }
      log.end();
    },
  };
}
```

**Create `desktop/src/main/backend/protocol.ts`:**

```ts
import { net, protocol } from "electron";
import { APP_HOST, APP_SCHEME, TOKEN_HEADER } from "@shared/security";

/** MUST be called before `app` is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/** Proxy masarflow://app/* to the loopback server, adding the launch token. */
export function installAppProtocol(opts: { target: string; token: string }): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response("Not found", { status: 404 });
    const headers = new Headers(request.headers);
    headers.set(TOKEN_HEADER, opts.token);
    return net.fetch(`${opts.target}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.body,
      // undici requires `duplex` for streamed request bodies; it is not in lib.dom's RequestInit.
      ...({ duplex: "half" } as object),
      redirect: "manual",
      bypassCustomProtocolHandlers: true,
    });
  });
}
```

Verification (no Electron runtime needed): `pnpm desktop:typecheck` is deferred to P1.T6. Instead: `grep -n "bypassCustomProtocolHandlers" desktop/node_modules/electron/electron.d.ts | head -2` must print a line.

Commit: `feat(desktop): utilityProcess backend manager and masarflow:// proxy protocol`.

## P1.T5 — Window, IPC, entry point (≈12 min)

**Create `desktop/src/main/windows/main-window.ts`:**

```ts
import { BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { APP_ORIGIN } from "@shared/security";
import { isInternalUrl, isSafeExternalUrl } from "../security/url-policy";

export interface MainWindowOptions {
  /** Set only in `pnpm dev:desktop`: the Next dev server URL. */
  devUrl?: string;
  onClose: (e: Electron.Event) => void;
}

export function createMainWindow(opts: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: "#0a0a0c",
    icon: join(__dirname, "../../resources/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  const guard = (e: Electron.Event, url: string): void => {
    if (isInternalUrl(url, opts.devUrl)) return;
    e.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  };
  win.webContents.on("will-navigate", (e, url) => guard(e, url));
  win.webContents.on("will-redirect", (e, url) => guard(e, url));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternalUrl(url, opts.devUrl) && isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  win.once("ready-to-show", () => win.show());
  win.on("close", opts.onClose);
  void win.loadURL(opts.devUrl ?? `${APP_ORIGIN}/`);
  return win;
}
```

**Create `desktop/src/main/ipc/index.ts`:**

```ts
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { isSafeExternalUrl } from "../security/url-policy";

const DISPLAY_VERSION = "0.2.0.0"; // single source for UI; package.json holds the semver

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const win = (): BrowserWindow | null => getWindow();

  ipcMain.handle(CH.appInfo, () => ({
    version: app.getVersion(),
    displayVersion: DISPLAY_VERSION,
    userData: app.getPath("userData"),
    packaged: app.isPackaged,
  }));
  ipcMain.handle(CH.appOpenLogs, () => shell.openPath(join(app.getPath("userData"), "logs")));
  ipcMain.on(CH.appRelaunch, () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle(CH.dialogChooseFolder, async () => {
    const w = win();
    const res = w
      ? await dialog.showOpenDialog(w, { properties: ["openDirectory", "createDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
  });

  ipcMain.handle(CH.shellOpenExternal, (_e, url: string) => {
    if (typeof url === "string" && isSafeExternalUrl(url)) return shell.openExternal(url);
    return undefined;
  });
  ipcMain.on(CH.shellShowItem, (_e, p: string) => {
    if (typeof p === "string") shell.showItemInFolder(p);
  });

  ipcMain.handle(CH.clipboardWrite, (_e, text: string) => clipboard.writeText(String(text)));
  ipcMain.handle(CH.clipboardRead, () => clipboard.readText());

  ipcMain.on(CH.winMinimize, () => win()?.minimize());
  ipcMain.on(CH.winToggleMax, () => {
    const w = win();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.on(CH.winClose, () => win()?.close());
  ipcMain.handle(CH.winIsMax, () => win()?.isMaximized() ?? false);
}
```

**Replace `desktop/src/main/index.ts`** entirely:

```ts
import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { installAppProtocol, registerAppScheme } from "./backend/protocol";
import { startBackend, type BackendHandle } from "./backend/server";
import { registerIpc } from "./ipc";
import { createMainWindow } from "./windows/main-window";

app.setName("MasarFlow");
registerAppScheme(); // must run before 'ready'

const DEV_URL = process.env.MASARFLOW_DEV_URL?.trim() || undefined;
const SMOKE = process.env.MASARFLOW_SMOKE === "1";
if (DEV_URL) app.setPath("userData", join(app.getPath("appData"), "MasarFlow-dev"));

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backend: BackendHandle | null = null;
let quitting = false;

function createTray(): void {
  const icon = nativeImage
    .createFromPath(join(__dirname, "../../resources/icon.png"))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("MasarFlow");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open MasarFlow", click: () => showWindow() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => showWindow());
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Smoke mode: prove the packaged app boots the workspace, report to a file, exit. */
function runSmoke(win: BrowserWindow): void {
  const out = process.env.MASARFLOW_SMOKE_OUT ?? "";
  const finish = (payload: object, code: number): void => {
    if (out) writeFileSync(out, JSON.stringify(payload));
    app.exit(code);
  };
  const timer = setTimeout(() => finish({ ok: false, error: "timeout waiting for /dashboard" }, 1), 90_000);
  win.webContents.on("did-finish-load", async () => {
    try {
      const info = await win.webContents.executeJavaScript(
        `({ path: location.pathname, origin: location.origin, hasApi: typeof window.masarflow === "object" })`,
      );
      if (String(info.path).startsWith("/dashboard")) {
        clearTimeout(timer);
        finish({ ok: true, ...info }, 0);
      }
    } catch (e) {
      finish({ ok: false, error: String(e) }, 1);
    }
  });
}

async function boot(): Promise<void> {
  try {
    if (!DEV_URL) {
      const serverEntry = app.isPackaged
        ? join(process.resourcesPath, "app-server", "server.js")
        : join(__dirname, "../../app-server/server.js");
      backend = await startBackend({
        serverEntry,
        logDir: join(app.getPath("userData"), "logs"),
        env: { MASARFLOW_DATA_DIR: app.getPath("userData"), MASARFLOW_VERSION: app.getVersion() },
      });
      installAppProtocol({ target: backend.origin, token: backend.token });
    }
  } catch (e) {
    const choice = dialog.showMessageBoxSync({
      type: "error",
      title: "MasarFlow could not start",
      message: "The local workspace service failed to start.",
      detail: String((e as Error).message ?? e).slice(0, 1500),
      buttons: ["Open logs folder", "Quit"],
      defaultId: 1,
    });
    if (choice === 0) await shell.openPath(join(app.getPath("userData"), "logs"));
    app.exit(1);
    return;
  }

  registerIpc(() => mainWindow);
  mainWindow = createMainWindow({
    devUrl: DEV_URL,
    onClose: () => {
      quitting = true; // close = quit; the tray "hide on close" option arrives in P10
    },
  });
  mainWindow.on("maximize", () => mainWindow?.webContents.send(CH.winMaximized, true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send(CH.winMaximized, false));
  if (SMOKE) runSmoke(mainWindow);
  else createTray();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    void boot();
  });
  app.on("before-quit", () => {
    quitting = true;
    void backend?.stop();
  });
  app.on("window-all-closed", () => {
    if (quitting || process.platform !== "darwin") app.quit();
  });
}
```

Commit: `feat(desktop): main window, typed IPC and new entry point`. (Typecheck still deferred.)

## P1.T6 — Retire the launcher renderer (≈8 min)

1. Preserve the old launcher for P8 (terminal) and history: `git tag archive/launcher-v0.1.5.1 release/v0.2.0~5` — use the commit **before** P1.T2 (`git log --oneline | head -8` to find it). Verify: `git show archive/launcher-v0.1.5.1:desktop/src/renderer/src/components/terminal/terminal-view.tsx | head -3` prints code.
2. Delete: `desktop/src/renderer/`, `desktop/src/main/{env,setup,selftest,guitest,server-status,updates}.ts`, `desktop/tsconfig.web.json`. **Keep** `desktop/src/main/pty.ts` and `desktop/src/main/settings.ts` (P8/P10 reuse). Trim `desktop/src/shared/types.ts` to only what `pty.ts` and `settings.ts` import (`SessionInfo`, `StartSessionRequest`, `SessionOutputPayload`, `SessionExitPayload`, `AppSettings`) — `pnpm desktop:typecheck` names every dangling import.
3. `desktop/electron.vite.config.ts`: remove the `renderer` block, the `rendererRoot` const and the react/tailwind imports; keep `main`/`preload` with the `@shared` alias and `external: ["node-pty"]`.
3b. Typecheck wiring (the old setup is a solution-style tsconfig that references the deleted `tsconfig.web.json`):
   - `desktop/tsconfig.json` → `{ "files": [], "references": [{ "path": "./tsconfig.node.json" }] }`
   - `desktop/package.json` script → `"typecheck": "tsc -p tsconfig.node.json --noEmit"`
   - `desktop/tsconfig.node.json`: delete the `"@/*": ["src/renderer/src/*"]` path and `"jsx": "react-jsx"`.
4. `desktop/package.json`: `"name": "masarflow-desktop"`, `"version": "0.2.0-alpha.0"`, `"description": "MasarFlow desktop application"`; remove devDependencies only the renderer used (`@tailwindcss/vite @types/react @types/react-dom @vitejs/plugin-react @xterm/* geist lucide-react react react-dom tailwindcss vite xterm zustand`). Keep `electron electron-builder electron-vite typescript @types/node node-pty`. Set root `package.json` `"version": "0.2.0-alpha.0"`. `desktop/tsconfig.json` and `tsconfig.node.json`: drop the `src/renderer` path alias and `jsx`.
5. `pnpm install` then:

```bash
pnpm desktop:typecheck      # expect exit 0
pnpm typecheck              # expect only "$ tsc --noEmit"
pnpm test                   # expect same pass count as baseline + new tests
```

**Parity checklist (write into the commit body — each item has a destination):** terminal → P8 · env/config editor → P10 Settings→System & AI Providers · setup/clone → obsolete (installer) · run dev/prod → obsolete (auto) · update check → P10 electron-updater · selftest/guitest → replaced by `smoke:desktop` (P1.T9) · tray → kept.

Commit: `refactor(desktop)!: retire launcher renderer; main app is the workspace`.

## P1.T7 — Bridge + window controls + drag region in the Next shell (TDD for the helper, ≈8 min)

**Failing test — `tests/unit/lib/desktop/bridge.test.ts`:**

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { getDesktop } from "@/lib/desktop/bridge";

afterEach(() => vi.unstubAllGlobals());

describe("getDesktop", () => {
  it("is null without a window (SSR / node)", () => {
    expect(getDesktop()).toBeNull();
  });
  it("returns the preload API when present", () => {
    const api = { platform: "win32" };
    vi.stubGlobal("window", { masarflow: api });
    expect(getDesktop()).toBe(api);
  });
  it("is null in a plain browser window", () => {
    vi.stubGlobal("window", {});
    expect(getDesktop()).toBeNull();
  });
});
```
Run → FAIL. **Create `src/lib/desktop/bridge.ts`:**

```ts
import type { MasarflowApi } from "@desktop-shared/api";

declare global {
  interface Window {
    masarflow?: MasarflowApi;
  }
}

/** The Electron preload API, or null when running in a plain browser / during SSR. */
export function getDesktop(): MasarflowApi | null {
  if (typeof window === "undefined") return null;
  return window.masarflow ?? null;
}
```
Add to root `tsconfig.json` `compilerOptions.paths`: `"@desktop-shared/*": ["./desktop/src/shared/*"]` (keep the existing `@/*`). Do **not** touch `include`/`exclude` — `desktop` is in `exclude`, but an excluded file that is *imported* is still type-checked, which is exactly what we want. `desktop/src/shared/api.ts` uses `NodeJS.Platform`; `@types/node` is already present in the root project. Run test → PASS; `pnpm typecheck` → clean.

**Create `src/components/shell/window-controls.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { getDesktop } from "@/lib/desktop/bridge";
import { useMounted } from "@/lib/hooks/use-mounted";

/** Min / max / close for the frameless desktop window. Renders nothing in a browser. */
export function WindowControls() {
  const mounted = useMounted();
  const desktop = mounted ? getDesktop() : null;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    void desktop.window.isMaximized().then(setMaximized);
    return desktop.window.onMaximized(setMaximized);
  }, [desktop]);

  if (!desktop) return null;
  const btn =
    "grid h-8 w-11 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  return (
    <div className="app-no-drag -mr-2 ml-2 flex items-stretch">
      <button type="button" className={btn} aria-label="Minimize window" onClick={() => desktop.window.minimize()}>
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        aria-label={maximized ? "Restore window" : "Maximize window"}
        onClick={() => desktop.window.toggleMaximize()}
      >
        <Square className="size-3.5" />
      </button>
      <button
        type="button"
        className={`${btn} hover:bg-red-600 hover:text-white`}
        aria-label="Close window"
        onClick={() => desktop.window.close()}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
```
**Patch `src/components/shell/topbar.tsx`:** the root is `<header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">` — add `app-drag` to that string; render `<WindowControls />` as the last child of the header (after the right-hand cluster). Imports needed: `import { WindowControls } from "./window-controls";`. **Append to `src/app/globals.css`:**

```css
/* Frameless Electron window: the top bar drags the window, controls inside it do not. */
.app-drag { -webkit-app-region: drag; }
.app-drag button,
.app-drag a,
.app-drag input,
.app-drag select,
.app-drag textarea,
.app-drag [role="button"],
.app-no-drag { -webkit-app-region: no-drag; }
```
Run `pnpm lint` (0 errors) and `pnpm typecheck`. Commit: `feat(shell): desktop bridge, window controls and drag region`.

## P1.T8 — electron-builder config, dev script (≈6 min)

**Replace `desktop/electron-builder.yml`:**

```yaml
appId: com.masarflow.app
productName: MasarFlow
directories:
  buildResources: resources
  output: dist
files:
  - out/**
  - resources/**
extraResources:
  - from: app-server
    to: app-server
npmRebuild: false
asarUnpack:
  - "**/node_modules/node-pty/**"
win:
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]
  icon: resources/icon.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false
  deleteAppDataOnUninstall: false
```

**Create `scripts/dev-desktop.mjs`:**

```js
#!/usr/bin/env node
// Dev: Next dev server + Electron pointing at it (no embedded server, no token).
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const PORT = Number(process.env.PORT ?? 3000);
const win = process.platform === "win32";

function killTree(child) {
  if (!child?.pid) return;
  if (win) spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
  else child.kill("SIGTERM");
}
function waitForPort(port, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => { s.destroy(); Date.now() > end ? reject(new Error("next dev did not start")) : setTimeout(probe, 500); });
    };
    probe();
  });
}

const next = spawn("pnpm", ["exec", "next", "dev", "-p", String(PORT)], { stdio: "inherit", shell: win });
const cleanup = () => { killTree(next); killTree(electron); };
let electron;
process.on("SIGINT", () => { cleanup(); process.exit(0); });
await waitForPort(PORT);
electron = spawn("pnpm", ["--dir", "desktop", "exec", "electron-vite", "dev"], {
  stdio: "inherit",
  shell: win,
  env: { ...process.env, MASARFLOW_DEV_URL: `http://localhost:${PORT}` },
});
electron.on("exit", (code) => { cleanup(); process.exit(code ?? 0); });
```
Note: `appId` changes from `com.masarflow.launcher` → `com.masarflow.app`, so the new installer installs **side by side** with the old launcher and uses `%APPDATA%\MasarFlow` (the old one used `MasarFlow Launcher`). Mention in the changelog that the old launcher can be uninstalled. User data lives in IndexedDB under the new origin `masarflow://app`, so v0.1 data is **not** auto-visible — P4.T6 provides the import path from a v0.1 export.

Commit: `build(desktop): electron-builder config for MasarFlow, dev:desktop script`.

## P1.T9 — Smoke harness and the P1 exit gate (≈10 min)

**Create `scripts/smoke-desktop.mjs`:**

```js
#!/usr/bin/env node
// Boots the UNPACKED packaged app with a throwaway profile and asserts the workspace loads.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = path.join(root, "desktop", "dist", "win-unpacked", "MasarFlow.exe");
if (!existsSync(exe)) {
  console.error("Missing", exe, "— run `pnpm desktop:dist:dir` first.");
  process.exit(1);
}
const tmp = mkdtempSync(path.join(os.tmpdir(), "masarflow-smoke-"));
const out = path.join(tmp, "result.json");

const child = spawn(exe, [`--user-data-dir=${path.join(tmp, "profile")}`], {
  env: { ...process.env, MASARFLOW_SMOKE: "1", MASARFLOW_SMOKE_OUT: out },
  stdio: "ignore",
});
const killer = setTimeout(() => child.kill(), 120_000);
child.on("exit", () => {
  clearTimeout(killer);
  if (!existsSync(out)) { console.error("SMOKE_FAIL: no result file"); process.exit(1); }
  const r = JSON.parse(readFileSync(out, "utf8"));
  if (r.ok && r.origin === "masarflow://app" && r.hasApi === true) {
    console.log("SMOKE_OK", JSON.stringify(r));
    process.exit(0);
  }
  console.error("SMOKE_FAIL", JSON.stringify(r));
  process.exit(1);
});
```

Run the gate:

```bash
pnpm desktop:dist:dir          # builds Next, assembles app-server, packs win-unpacked
pnpm smoke:desktop             # expect: SMOKE_OK {"ok":true,"path":"/dashboard","origin":"masarflow://app","hasApi":true}
pnpm test && pnpm typecheck && pnpm desktop:typecheck
```
Also run the **persistence proof manually once** (record in the commit body): launch `desktop/dist/win-unpacked/MasarFlow.exe`, create a project named "Persist Test", quit, relaunch → the project is still there (origin `masarflow://app` stable though the server port changed).

**If smoke fails:** open `%APPDATA%\MasarFlow\logs\server.log` (the smoke profile's `--user-data-dir` holds it instead — check `$TMP/masarflow-smoke-*/profile/logs/server.log`). Typical causes: missing `public/` or `.next/static` in `app-server` (P1.T3), `Cannot find module` (S1 symlink fallback), 401 loops (token header not injected — P1.T4).

Commit: `test(desktop): packaged-build smoke harness; P1 gate green`.

**P1 done when:** the smoke prints `SMOKE_OK`, the three verify commands are green, and `git log --oneline | head -12` shows one commit per task above.
