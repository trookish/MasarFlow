# MasarFlow v0.2.0.0 — Phases P2, P3, P4: Security, Runtime Independence, Data Safety

> **For Hermes:** read the master plan first (`…-masarflow-v0-2-0-0-master.md`: decisions D1–D12, conventions §6) and finish P0+P1 (`…-p0-p1-baseline-desktop-shell.md`).
> Commit after every task. Never push. TDD: failing test → run → implement → run → commit.
> P1b (AI providers), P2, P3, P4 touch mostly disjoint files and **may run as parallel streams after P1**. Shared files — `desktop/src/main/index.ts`, `desktop/src/main/ipc/index.ts`, `desktop/src/shared/{api,channels}.ts`, `desktop/src/preload/index.ts`, `src/app/(workspace)/layout.tsx`, `src/lib/db/index.ts` — must be edited by **one stream at a time** (rebase before editing; append, never reorder).

**Findings these phases are built on (verified 2026-10-16):**
- `scripts/start.mjs` (798 lines) is today's real orchestrator (Python spawn, ports file). The Electron app (P1) does not start Python; P3 removes that need. OpenCode orchestration no longer exists (dropped; see P1b).
- No non-browser process calls the Next server any more (the OpenCode tool bridge was removed), so the launch-token guard has **no exempt paths**.
- Secrets at rest today: `aiConnections.apiKey` (Dexie, `src/lib/db/schema.ts`), `pat` in zustand store `masarflow-github`, `apiKey` in `masarflow-obsidian` — all plaintext in browser storage.
- `src/lib/ai/embedding-sync.ts` (python bridge), `fetchRagChunks` in `src/lib/ai/context.ts:414`, `search_workspace` in `src/lib/ai/tools.ts:160`, `src/components/search/search-view.tsx:98,124` and `settings-view.tsx:1469,1505` are the only consumers of `/api/python/*`; `tests/unit/lib/ai/embedding-sync.test.ts` is the only test that touches it.
- The Python chunker has 5 tests in `python-service/tests/test_chunking.py` — P3 ports them 1:1 to TypeScript.

---

# (Phase 1b is in its own file: `…-p1b-ai-providers.md` — OpenCode was dropped in favour of Hermes-style provider connections.)

---

# PHASE 2 — Security & secrets

**Threat model in one paragraph:** the server listens on loopback only, but any web page the user visits can send requests to `127.0.0.1:<port>` (CSRF, DNS rebinding), and any local process can too. `/api/fs/shell` executes commands. Defence: (1) every request must carry the launch token (only Electron main knows it), (2) `Host` must be the loopback address (anti-rebinding), (3) if an `Origin` header exists it must be `masarflow://app`, (4) filesystem roots must have been chosen by the user through the native picker, (5) secrets are encrypted at rest with the OS keychain, (6) the renderer is locked down by CSP/permissions/navigation rules.

## P2.T1 — Request guard (pure, TDD, ≈8 min)

**Failing test `tests/unit/lib/server/request-guard.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { checkRequest, guardConfigFromEnv, type GuardConfig, type GuardRequest } from "@/lib/server/request-guard";

const cfg: GuardConfig = {
  token: "T".repeat(64),
  allowedHosts: ["127.0.0.1:41000", "localhost:41000"],
  allowedOrigins: ["masarflow://app"],
};
const req = (over: Partial<GuardRequest> = {}): GuardRequest => ({
  method: "GET",
  pathname: "/api/health",
  host: "127.0.0.1:41000",
  origin: null,
  token: cfg.token,
  ...over,
});

describe("checkRequest", () => {
  it("accepts a valid renderer request", () => {
    expect(checkRequest(cfg, req())).toEqual({ ok: true });
    expect(checkRequest(cfg, req({ method: "POST", origin: "masarflow://app" }))).toEqual({ ok: true });
  });
  it("rejects a missing or wrong token with 401", () => {
    expect(checkRequest(cfg, req({ token: null }))).toMatchObject({ ok: false, status: 401 });
    expect(checkRequest(cfg, req({ token: "x" }))).toMatchObject({ ok: false, status: 401 });
    expect(checkRequest(cfg, req({ token: cfg.token.slice(0, -1) + "x" }))).toMatchObject({ ok: false, status: 401 });
  });
  it("rejects a foreign Host with 403 (DNS rebinding)", () => {
    expect(checkRequest(cfg, req({ host: "evil.example" }))).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(cfg, req({ host: "127.0.0.1:9999" }))).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(cfg, req({ host: null }))).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects a foreign Origin for every method with 403", () => {
    expect(checkRequest(cfg, req({ origin: "https://evil.example" }))).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(cfg, req({ method: "POST", origin: "http://localhost:3000" }))).toMatchObject({ ok: false, status: 403 });
  });
  it("requires an Origin on state-changing requests", () => {
    expect(checkRequest(cfg, req({ method: "POST", origin: null }))).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(cfg, req({ method: "DELETE", origin: null }))).toMatchObject({ ok: false, status: 403 });
  });
  it("has no exempt paths: even a former bridge path needs the token", () => {
    const r = req({ method: "POST", pathname: "/api/opencode/ws-call", token: null, origin: null });
    expect(checkRequest(cfg, r)).toMatchObject({ ok: false, status: 401 });
  });
  it("prefixes every denial so callers can tell guard errors from route errors", () => {
    const r = checkRequest(cfg, req({ token: null }));
    expect(r.ok === false && r.reason).toMatch(/^MasarFlow guard:/);
  });
});

describe("guardConfigFromEnv", () => {
  it("is null (not enforced) without a launch token", () => {
    expect(guardConfigFromEnv({})).toBeNull();
    expect(guardConfigFromEnv({ MASARFLOW_TOKEN: "  " })).toBeNull();
  });
  it("derives hosts from PORT and allows only the app origin", () => {
    expect(guardConfigFromEnv({ MASARFLOW_TOKEN: "abc", PORT: "41000" })).toEqual({
      token: "abc",
      allowedHosts: ["127.0.0.1:41000", "localhost:41000"],
      allowedOrigins: ["masarflow://app"],
    });
  });
});
```
Run → FAIL. **Create `src/lib/server/request-guard.ts`:**

```ts
import { timingSafeEqual } from "node:crypto";

export const TOKEN_HEADER = "x-masarflow-token";

export interface GuardConfig {
  /** Per-launch secret known only to Electron main. */
  token: string;
  /** Exact `Host` header values the server may be addressed as. */
  allowedHosts: string[];
  /** Exact `Origin` values allowed to call the API. */
  allowedOrigins: string[];
}

export interface GuardRequest {
  method: string;
  pathname: string;
  host: string | null;
  origin: string | null;
  token: string | null;
}

export type GuardResult = { ok: true } | { ok: false; status: 401 | 403; reason: string };

const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

function safeEqual(expected: string, actual: string | null): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

const deny = (status: 401 | 403, why: string): GuardResult => ({ ok: false, status, reason: `MasarFlow guard: ${why}` });

export function checkRequest(cfg: GuardConfig, r: GuardRequest): GuardResult {
  const host = r.host?.toLowerCase() ?? "";
  if (!host || !cfg.allowedHosts.includes(host)) return deny(403, "host not allowed");

  if (!safeEqual(cfg.token, r.token)) return deny(401, "missing or invalid launch token");

  if (r.origin !== null) {
    if (!cfg.allowedOrigins.includes(r.origin)) return deny(403, "origin not allowed");
  } else if (!READ_ONLY.has(r.method.toUpperCase())) {
    return deny(403, "state-changing requests must carry an allowed origin");
  }
  return { ok: true };
}

/** Enforcement is on only when Electron main set a launch token (packaged app). */
export function guardConfigFromEnv(env: Record<string, string | undefined>): GuardConfig | null {
  const token = env.MASARFLOW_TOKEN?.trim();
  if (!token) return null;
  const port = env.PORT?.trim() || "3000";
  return {
    token,
    allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
    allowedOrigins: ["masarflow://app"],
  };
}
```
Run → PASS. Commit: `feat(security): request guard — launch token, host and origin rules (tested)`.

## P2.T2 — Wire the guard into Next 16 `proxy.ts` (TDD, ≈6 min)

Next 16 renamed `middleware` → `proxy` (file `src/proxy.ts`, exported function `proxy`, Node runtime). Verified in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.

**Failing test `tests/unit/proxy.test.ts`:**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const url = "http://127.0.0.1:41000/api/fs/list";
afterEach(() => {
  delete process.env.MASARFLOW_TOKEN;
  delete process.env.PORT;
});

describe("proxy", () => {
  it("passes everything through when no launch token is configured (browser dev)", () => {
    const res = proxy(new NextRequest(url, { method: "POST" }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
  it("returns 401 JSON when the token is missing", async () => {
    process.env.MASARFLOW_TOKEN = "tok";
    process.env.PORT = "41000";
    const res = proxy(new NextRequest(url, { headers: { host: "127.0.0.1:41000" } }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/^MasarFlow guard:/);
  });
  it("passes a fully valid request", () => {
    process.env.MASARFLOW_TOKEN = "tok";
    process.env.PORT = "41000";
    const res = proxy(
      new NextRequest(url, {
        method: "POST",
        headers: { host: "127.0.0.1:41000", origin: "masarflow://app", "x-masarflow-token": "tok" },
      }),
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
```
Run → FAIL. **Create `src/proxy.ts`:**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { TOKEN_HEADER, checkRequest, guardConfigFromEnv } from "@/lib/server/request-guard";

export function proxy(request: NextRequest): NextResponse {
  const cfg = guardConfigFromEnv(process.env);
  if (!cfg) return NextResponse.next();
  const result = checkRequest(cfg, {
    method: request.method,
    pathname: request.nextUrl.pathname,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    token: request.headers.get(TOKEN_HEADER),
  });
  if (result.ok) return NextResponse.next();
  return NextResponse.json({ error: result.reason }, { status: result.status });
}

export const config = {
  // Static assets carry no data; everything else (pages, API routes) is guarded.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|models/|ort/).*)"],
};
```
Run → PASS. **If** the test environment cannot import `next/server` in a node env (error about `Request`), keep the first two assertions and move the third into `scripts/security-check.mjs` (P2.T9) — note it in the commit. `pnpm build` must still succeed (`pnpm build 2>&1 | tail -15` → ends with the route table, and lists `ƒ Proxy (Middleware)`).

Commit: `feat(security): enforce the request guard through Next 16 proxy.ts`.

## P2.T3 — Shared root allow-list logic + server enforcement (TDD, ≈8 min)

**Failing test `tests/unit/shared/roots.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { isRootAllowed, normalizeRoot, parseRoots } from "@desktop-shared/roots";

describe("normalizeRoot", () => {
  it("lower-cases and drops trailing separators on win32", () => {
    expect(normalizeRoot("C:\\Users\\A\\Proj\\", "win32")).toBe("c:\\users\\a\\proj");
  });
  it("keeps case on linux", () => {
    expect(normalizeRoot("/home/A/Proj/", "linux")).toBe("/home/A/Proj");
  });
});

describe("isRootAllowed", () => {
  const roots = ["C:\\Users\\a\\proj"];
  it("allows the root itself, case-insensitively, and its sub-folders", () => {
    expect(isRootAllowed("c:\\users\\A\\PROJ", roots, "win32")).toBe(true);
    expect(isRootAllowed("C:\\Users\\a\\proj\\src", roots, "win32")).toBe(true);
  });
  it("rejects siblings with a shared prefix, parents and traversal", () => {
    expect(isRootAllowed("C:\\Users\\a\\proj-evil", roots, "win32")).toBe(false);
    expect(isRootAllowed("C:\\Users\\a", roots, "win32")).toBe(false);
    expect(isRootAllowed("C:\\Users\\a\\proj\\..\\other", roots, "win32")).toBe(false);
    expect(isRootAllowed("D:\\Users\\a\\proj", roots, "win32")).toBe(false);
  });
  it("rejects everything when nothing is registered", () => {
    expect(isRootAllowed("C:\\x", [], "win32")).toBe(false);
  });
});

describe("parseRoots", () => {
  it("tolerates garbage", () => {
    expect(parseRoots("not json")).toEqual([]);
    expect(parseRoots('{"roots":[1,"C:\\\\a"]}')).toEqual(["C:\\a"]);
    expect(parseRoots('{"roots":"x"}')).toEqual([]);
  });
});
```
Run → FAIL. **Create `desktop/src/shared/roots.ts`:**

```ts
import { posix, win32 } from "node:path";

const mod = (platform: NodeJS.Platform) => (platform === "win32" ? win32 : posix);

/** Canonical form used for comparing roots: absolute, no trailing separator, case-folded on Windows. */
export function normalizeRoot(p: string, platform: NodeJS.Platform = process.platform): string {
  const resolved = mod(platform).resolve(p);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** True when `root` equals a registered root or lies inside one. */
export function isRootAllowed(root: string, roots: string[], platform: NodeJS.Platform = process.platform): boolean {
  const m = mod(platform);
  const target = normalizeRoot(root, platform);
  return roots.some((r) => {
    const base = normalizeRoot(r, platform);
    if (target === base) return true;
    const rel = m.relative(base, target);
    return rel !== "" && !rel.startsWith("..") && !m.isAbsolute(rel);
  });
}

export function parseRoots(raw: string): string[] {
  try {
    const data = JSON.parse(raw) as { roots?: unknown };
    return Array.isArray(data.roots) ? data.roots.filter((r): r is string => typeof r === "string") : [];
  } catch {
    return [];
  }
}
```
Run → PASS.

**Failing test `tests/unit/lib/server/roots.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertRootAllowed } from "@/lib/server/roots";

describe("assertRootAllowed", () => {
  it("is a no-op without MASARFLOW_DATA_DIR (browser dev)", () => {
    expect(() => assertRootAllowed("C:\\anything", {})).not.toThrow();
  });
  it("rejects unregistered roots and accepts registered ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "msf-roots-"));
    const allowed = mkdtempSync(join(tmpdir(), "msf-allowed-"));
    writeFileSync(join(dir, "roots.json"), JSON.stringify({ roots: [allowed] }));
    const env = { MASARFLOW_DATA_DIR: dir };
    expect(() => assertRootAllowed(allowed, env)).not.toThrow();
    expect(() => assertRootAllowed(join(allowed, "sub"), env)).not.toThrow();
    expect(() => assertRootAllowed(tmpdir(), env)).toThrow();
    try {
      assertRootAllowed(tmpdir(), env);
    } catch (e) {
      expect((e as { status: number }).status).toBe(403);
    }
  });
  it("rejects everything when roots.json is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "msf-roots-"));
    expect(() => assertRootAllowed(tmpdir(), { MASARFLOW_DATA_DIR: dir })).toThrow();
  });
});
```
Run → FAIL. **Create `src/lib/server/roots.ts`:**

```ts
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isRootAllowed, parseRoots } from "@desktop-shared/roots";

let cache: { file: string; mtimeMs: number; roots: string[] } | null = null;

function loadRoots(dataDir: string): string[] {
  const file = join(dataDir, "roots.json");
  try {
    const { mtimeMs } = statSync(file);
    if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.roots;
    const roots = parseRoots(readFileSync(file, "utf8"));
    cache = { file, mtimeMs, roots };
    return roots;
  } catch {
    return [];
  }
}

/**
 * Throws `{status:403}` unless `root` was registered through the native folder picker.
 * Enforced only when Electron main provided MASARFLOW_DATA_DIR (packaged / desktop mode).
 */
export function assertRootAllowed(root: string, env: Record<string, string | undefined> = process.env): void {
  const dataDir = env.MASARFLOW_DATA_DIR?.trim();
  if (!dataDir) return;
  if (!isRootAllowed(root, loadRoots(dataDir))) {
    throw {
      status: 403,
      message: "This folder has not been linked on this computer. Choose it again with the folder picker.",
    };
  }
}
```
Run → PASS.

**Integrate:** in `src/app/api/fs/_shared.ts`, add `import { assertRootAllowed } from "@/lib/server/roots";` and, inside `resolveInsideRoot`, right after the `isAbsolute(root)` check add `assertRootAllowed(root);`. In `src/app/api/watch/route.ts`, after the `path.isAbsolute(dir)` check add:

```ts
  try {
    assertRootAllowed(dir);
  } catch (e) {
    return Response.json({ error: (e as { message: string }).message }, { status: 403 });
  }
```
(with the import).

**Static guard test `tests/unit/api/fs-routes-guarded.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { readSources } from "../_helpers/fs-scan";

describe("filesystem-touching routes enforce the root allow-list", () => {
  const routes = readSources().filter(
    (s) => /^src\/app\/api\/(fs\/[^/]+|watch)\/route\.ts$/.test(s.path),
  );
  it("finds the expected routes", () => {
    expect(routes.map((r) => r.path).sort()).toEqual([
      "src/app/api/fs/list/route.ts",
      "src/app/api/fs/read/route.ts",
      "src/app/api/fs/search/route.ts",
      "src/app/api/fs/shell/route.ts",
      "src/app/api/fs/write/route.ts",
      "src/app/api/watch/route.ts",
    ]);
  });
  it.each(routes.map((r) => [r.path, r.text] as const))("%s validates its root", (_path, text) => {
    expect(/resolveInsideRoot\(|assertRootAllowed\(/.test(text)).toBe(true);
  });
});
```
Run `pnpm test -- tests/unit/api tests/unit/lib/server tests/unit/shared` → all PASS. If `fs/shell/route.ts` fails the static test, it takes `cwd` without `resolveInsideRoot` — add `assertRootAllowed(root)` there before spawning (read the file first).

Commit: `feat(security): filesystem roots must be registered through the native picker`.

## P2.T4 — Main process: persist roots on pick, expose `roots.list` (TDD, ≈7 min)

**Failing test `tests/unit/desktop/roots-file.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRootToFile, readRootsFile } from "@desktop/security/roots";

describe("roots.json", () => {
  it("reads [] when the file does not exist", () => {
    expect(readRootsFile(join(mkdtempSync(join(tmpdir(), "msf-r-")), "roots.json"))).toEqual([]);
  });
  it("adds roots atomically and de-duplicates by normalized path", () => {
    const file = join(mkdtempSync(join(tmpdir(), "msf-r-")), "roots.json");
    const a = mkdtempSync(join(tmpdir(), "msf-a-"));
    addRootToFile(file, a);
    addRootToFile(file, a + (process.platform === "win32" ? "\\" : "/"));
    const roots = readRootsFile(file);
    expect(roots).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, "utf8")).roots).toHaveLength(1);
  });
});
```
Run → FAIL. **Create `desktop/src/main/security/roots.ts`:**

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeRoot, parseRoots } from "@shared/roots";

export function readRootsFile(file: string): string[] {
  try {
    return parseRoots(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

/** Register a folder the user picked. Atomic write so the server never reads a torn file. */
export function addRootToFile(file: string, dir: string): string[] {
  const roots = readRootsFile(file);
  if (!roots.some((r) => normalizeRoot(r) === normalizeRoot(dir))) roots.push(dir);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ roots }, null, 2), "utf8");
  renameSync(tmp, file);
  return roots;
}
```
Run → PASS.

**Wire (shared files — one stream at a time):**
1. `desktop/src/shared/channels.ts`: append `rootsList: "roots:list", rootsCovers: "roots:covers",` inside `CH`.
2. `desktop/src/shared/api.ts`: add to `MasarflowApi`: `roots: { list(): Promise<string[]>; /** True when `path` is a registered root or inside one. */ covers(path: string): Promise<boolean> };` and change the `dialog.chooseFolder` doc to `/** Native folder picker; the chosen folder is registered as an allowed root. */`. Extend the signature: `chooseFolder(defaultPath?: string): Promise<string | null>;`.
3. `desktop/src/preload/index.ts`: `dialog: { chooseFolder: (d) => ipcRenderer.invoke(CH.dialogChooseFolder, d) }` and `roots: { list: () => ipcRenderer.invoke(CH.rootsList), covers: (p) => ipcRenderer.invoke(CH.rootsCovers, p) }`.
4. `desktop/src/main/ipc/index.ts`: in the `dialogChooseFolder` handler accept `(_e, defaultPath?: string)`, pass `defaultPath: typeof defaultPath === "string" ? defaultPath : undefined` to `showOpenDialog`, and after a successful pick call `addRootToFile(join(app.getPath("userData"), "roots.json"), picked)` before returning. Add `ipcMain.handle(CH.rootsList, () => readRootsFile(join(app.getPath("userData"), "roots.json")));` and `ipcMain.handle(CH.rootsCovers, (_e, p: unknown) => typeof p === "string" && isRootAllowed(p, readRootsFile(join(app.getPath("userData"), "roots.json"))));` (import `isRootAllowed` from `@shared/roots`).

`pnpm desktop:typecheck && pnpm typecheck` → exit 0.

**UI:** read `src/components/chat/linked-projects-dialog.tsx` (the only creator of linked projects, line ≈59). In desktop mode (`getDesktop()` non-null): make the path input `readOnly`, add a **Browse…** button that calls `getDesktop()!.dialog.chooseFolder()` and fills the input with the result; in a plain browser keep today's editable input. For every already-linked project row, call `getDesktop()?.roots.covers(row.root)` once on open (do **not** import `@desktop-shared/roots` into client code — it uses `node:path`; the main process does the comparison) and, when it resolves `false`, show an amber **Re-grant access** button calling `chooseFolder(row.root)`. Copy (formal): button `Browse…`, helper text `Choose the project folder. MasarFlow can only read folders you select here.`, re-grant label `Re-grant access`.

Commit: `feat(desktop): register picked folders as allowed roots; Browse and Re-grant in linked projects`.

## P2.T5 — Electron hardening: CSP, permissions, webview ban (TDD for pure parts, ≈7 min)

**Failing test `tests/unit/desktop/csp.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { buildCsp } from "@desktop/security/csp";
import { isPermissionAllowed } from "@desktop/security/permissions";

describe("buildCsp", () => {
  const prod = buildCsp({ dev: false });
  it("locks down plugins, base URI, forms and framing", () => {
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("form-action 'self'");
    expect(prod).toContain("frame-ancestors 'none'");
  });
  it("allows wasm (embeddings) but not eval in production", () => {
    expect(prod).toContain("'wasm-unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });
  it("allows eval and websockets in development only", () => {
    const dev = buildCsp({ dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws://localhost:*");
    expect(prod).not.toContain("ws://");
  });
  it("permits workers from blob: for the embedding worker", () => {
    expect(prod).toContain("worker-src 'self' blob:");
  });
});

describe("isPermissionAllowed", () => {
  it("allows only clipboard writes and fullscreen", () => {
    expect(isPermissionAllowed("clipboard-sanitized-write")).toBe(true);
    expect(isPermissionAllowed("fullscreen")).toBe(true);
    for (const p of ["media", "geolocation", "notifications", "midi", "clipboard-read", "openExternal", "hid", "usb"]) {
      expect(isPermissionAllowed(p)).toBe(false);
    }
  });
});
```
Run → FAIL. **Create `desktop/src/main/security/csp.ts`:**

```ts
/**
 * Content-Security-Policy for the renderer.
 * TODO(P9.T6): audit browser-side fetch() calls and narrow `connect-src` from `https:` to the providers actually used.
 */
export function buildCsp(opts: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'", "https:", "http://127.0.0.1:*", "http://localhost:*", ...(opts.dev ? ["ws://localhost:*"] : [])],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "https:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
```
**Create `desktop/src/main/security/permissions.ts`:**

```ts
const ALLOWED = new Set(["clipboard-sanitized-write", "fullscreen"]);

export function isPermissionAllowed(permission: string): boolean {
  return ALLOWED.has(permission);
}
```
Run → PASS.

**Wire (`desktop/src/main/index.ts` and `backend/protocol.ts`):**
- In `protocol.ts` wrap the proxied response: after `const res = await net.fetch(...)` (make the handler `async`), if `res.headers.get("content-type")?.includes("text/html")` return `new Response(res.body, { status: res.status, statusText: res.statusText, headers: (() => { const h = new Headers(res.headers); h.set("content-security-policy", buildCsp({ dev: false })); return h; })() })`, else return `res`.
- In `index.ts` after `app.whenReady()`: 
```ts
session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(isPermissionAllowed(permission)));
session.defaultSession.setPermissionCheckHandler((_wc, permission) => isPermissionAllowed(permission));
if (DEV_URL) {
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [buildCsp({ dev: true })] } });
  });
}
app.on("web-contents-created", (_e, contents) => contents.on("will-attach-webview", (ev) => ev.preventDefault()));
```
**Verify:** `pnpm desktop:typecheck`; then `pnpm desktop:dist:dir && pnpm smoke:desktop` → `SMOKE_OK`. Then launch the packaged app once and open DevTools is not available (menu removed) — instead run the smoke with `MASARFLOW_SMOKE_DEBUG=1` is **not** implemented; use the P9 e2e which fails on any `securitypolicyviolation` console error (task P9.T3). For now: manually click through `/brain/canvas`, `/brain/graph`, `/architecture` (Mermaid) and `/chat` once; any blank panel → read `%APPDATA%\MasarFlow\logs\main.log`… (if no CSP violations appear in the window, proceed; record in the commit body what you clicked).

Commit: `feat(security): CSP, permission deny-by-default and webview ban`.

## P2.T6 — Secret store in the main process (TDD with a fake codec, ≈7 min)

**Failing test `tests/unit/desktop/secrets.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecretStore, isValidSecretKey, type SecretCodec } from "@desktop/secrets";

const codec: SecretCodec = {
  available: () => true,
  encrypt: (s) => Buffer.from(s.split("").reverse().join("")).toString("base64"),
  decrypt: (c) => Buffer.from(c, "base64").toString().split("").reverse().join(""),
};
const file = () => join(mkdtempSync(join(tmpdir(), "msf-sec-")), "secrets.json");

describe("SecretStore", () => {
  it("round-trips and never writes plaintext to disk", () => {
    const f = file();
    const s = new SecretStore(f, codec);
    s.set("github:pat", "ghp_PLAINTEXT");
    expect(s.get("github:pat")).toBe("ghp_PLAINTEXT");
    expect(readFileSync(f, "utf8")).not.toContain("ghp_PLAINTEXT");
    expect(new SecretStore(f, codec).get("github:pat")).toBe("ghp_PLAINTEXT");
  });
  it("returns '' for unknown keys and deletes", () => {
    const s = new SecretStore(file(), codec);
    expect(s.get("nope")).toBe("");
    s.set("a", "1");
    s.delete("a");
    expect(s.get("a")).toBe("");
  });
  it("refuses to store when encryption is unavailable", () => {
    const s = new SecretStore(file(), { ...codec, available: () => false });
    expect(s.available()).toBe(false);
    expect(() => s.set("a", "1")).toThrow(/unavailable/i);
  });
  it("survives a corrupt file", () => {
    const f = file();
    new SecretStore(f, codec).set("a", "1");
    writeFileSync(f, "{broken");
    expect(new SecretStore(f, codec).get("a")).toBe("");
  });
});

describe("isValidSecretKey", () => {
  it("accepts namespaced ids and rejects odd keys", () => {
    expect(isValidSecretKey("ai-connection:0a1b-2c")).toBe(true);
    expect(isValidSecretKey("github:pat")).toBe(true);
    for (const k of ["", " x", "a/b", "a".repeat(81), "__proto__x y"]) expect(isValidSecretKey(k)).toBe(false);
  });
});
```
Run → FAIL. **Create `desktop/src/main/secrets.ts`:**

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface SecretCodec {
  available(): boolean;
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

export function isValidSecretKey(key: string): boolean {
  return /^[A-Za-z0-9:_-]{1,80}$/.test(key);
}

/** Adapts Electron's safeStorage (DPAPI / Keychain / libsecret) to SecretCodec. */
export function createSafeStorageCodec(ss: {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
}): SecretCodec {
  return {
    available: () => ss.isEncryptionAvailable(),
    encrypt: (s) => ss.encryptString(s).toString("base64"),
    decrypt: (c) => ss.decryptString(Buffer.from(c, "base64")),
  };
}

export class SecretStore {
  constructor(
    private readonly file: string,
    private readonly codec: SecretCodec,
  ) {}

  available(): boolean {
    return this.codec.available();
  }

  private read(): Record<string, string> {
    try {
      const data = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private write(map: Record<string, string>): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(map), "utf8");
    renameSync(tmp, this.file);
  }

  get(key: string): string {
    const cipher = this.read()[key];
    if (!cipher) return "";
    try {
      return this.codec.decrypt(cipher);
    } catch {
      return "";
    }
  }

  set(key: string, value: string): void {
    if (!this.codec.available()) throw new Error("Secret storage is unavailable on this system");
    const map = this.read();
    map[key] = this.codec.encrypt(value);
    this.write(map);
  }

  delete(key: string): void {
    const map = this.read();
    if (key in map) {
      delete map[key];
      this.write(map);
    }
  }
}
```
Run → PASS.

**Wire IPC (shared files — one stream at a time):**
1. `channels.ts`: append `secretsAvailable: "secrets:available", secretsGet: "secrets:get", secretsSet: "secrets:set", secretsDelete: "secrets:delete",`.
2. `api.ts`: add `secrets: { available(): Promise<boolean>; get(key: string): Promise<string>; set(key: string, value: string): Promise<void>; delete(key: string): Promise<void>; };`
3. `preload/index.ts`: implement with `ipcRenderer.invoke`.
4. `ipc/index.ts`: create `const secrets = new SecretStore(join(app.getPath("userData"), "secrets.json"), createSafeStorageCodec(safeStorage));` inside `registerIpc` (import `safeStorage` from electron) and register four handlers; each handler validates `isValidSecretKey(key)` and throws `new Error("Invalid secret key")` otherwise; `set` also requires `typeof value === "string"`.

`pnpm desktop:typecheck && pnpm typecheck` → exit 0. Commit: `feat(desktop): OS-keychain secret store over IPC`.

## P2.T7 — Renderer secrets API + AI connection keys (TDD, ≈10 min)

**Failing test `tests/unit/lib/secrets.test.ts`:**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getSecret, setSecret, deleteSecret, secretsAvailable, _resetSecretsForTests } from "@/lib/secrets";

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSecretsForTests();
});

describe("secrets without the desktop bridge (browser dev)", () => {
  it("is unavailable and uses an in-memory/localStorage fallback", async () => {
    expect(secretsAvailable()).toBe(false);
    await setSecret("a", "1");
    expect(await getSecret("a")).toBe("1");
    await deleteSecret("a");
    expect(await getSecret("a")).toBe("");
  });
});

describe("secrets with the desktop bridge", () => {
  it("delegates to window.masarflow.secrets", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      masarflow: {
        secrets: {
          available: async () => true,
          get: async (k: string) => store.get(k) ?? "",
          set: async (k: string, v: string) => void store.set(k, v),
          delete: async (k: string) => void store.delete(k),
        },
      },
    });
    _resetSecretsForTests();
    expect(secretsAvailable()).toBe(true);
    await setSecret("github:pat", "tok");
    expect(store.get("github:pat")).toBe("tok");
    expect(await getSecret("github:pat")).toBe("tok");
  });
});
```
Run → FAIL. **Create `src/lib/secrets.ts`:**

```ts
import { getDesktop } from "@/lib/desktop/bridge";

/**
 * Secret storage. In the desktop app values are encrypted by the OS keychain (via Electron
 * safeStorage) and never touch IndexedDB/localStorage. In a plain browser (dev only) there is
 * no secure store, so `secretsAvailable()` is false and callers keep their legacy storage.
 */
const fallback = new Map<string, string>();

export function _resetSecretsForTests(): void {
  fallback.clear();
}

/** True when an encrypted store backs get/set (desktop app). */
export function secretsAvailable(): boolean {
  return getDesktop()?.secrets !== undefined;
}

export async function getSecret(key: string): Promise<string> {
  const d = getDesktop();
  return d ? d.secrets.get(key) : (fallback.get(key) ?? "");
}

export async function setSecret(key: string, value: string): Promise<void> {
  const d = getDesktop();
  if (d) await d.secrets.set(key, value);
  else fallback.set(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  const d = getDesktop();
  if (d) await d.secrets.delete(key);
  else fallback.delete(key);
}
```
Run → PASS.

**Failing test `tests/unit/lib/db/repos/ai-connections-secrets.test.ts`** (fake-indexeddb + mocked secrets):

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

const vault = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/secrets", () => ({
  secretsAvailable: () => true,
  getSecret: async (k: string) => vault.get(k) ?? "",
  setSecret: async (k: string, v: string) => void vault.set(k, v),
  deleteSecret: async (k: string) => void vault.delete(k),
}));

import { db } from "@/lib/db";
import { aiConnectionsRepo } from "@/lib/db/repos";
import { migrateAiConnectionSecrets } from "@/lib/db/repos/chat-secrets";

beforeEach(async () => {
  vault.clear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("AI connection keys live in the secret store, not in IndexedDB", () => {
  it("create() stores the key as a secret and a blank in the row, but returns it hydrated", async () => {
    const c = await aiConnectionsRepo.create({ providerId: "openai", label: "Main", apiKey: "sk-TEST" });
    expect(c.apiKey).toBe("sk-TEST");
    expect((await db.aiConnections.get(c.id))!.apiKey).toBe("");
    expect(vault.get(`ai-connection:${c.id}`)).toBe("sk-TEST");
    expect((await aiConnectionsRepo.get(c.id))!.apiKey).toBe("sk-TEST");
    expect((await aiConnectionsRepo.list())[0].apiKey).toBe("sk-TEST");
  });
  it("update() without apiKey keeps the secret; with '' deletes it", async () => {
    const c = await aiConnectionsRepo.create({ providerId: "openai", label: "A", apiKey: "sk-1" });
    await aiConnectionsRepo.update(c.id, { label: "B" });
    expect(vault.get(`ai-connection:${c.id}`)).toBe("sk-1");
    await aiConnectionsRepo.update(c.id, { apiKey: "" });
    expect(vault.has(`ai-connection:${c.id}`)).toBe(false);
  });
  it("remove() deletes the secret", async () => {
    const c = await aiConnectionsRepo.create({ providerId: "openai", label: "A", apiKey: "sk-1" });
    await aiConnectionsRepo.remove(c.id);
    expect(vault.size).toBe(0);
  });
  it("migrates legacy plaintext rows", async () => {
    await db.aiConnections.add({ id: "legacy", providerId: "x", label: "L", apiKey: "sk-OLD", baseUrl: "", createdAt: 1, updatedAt: 1 });
    await migrateAiConnectionSecrets();
    expect((await db.aiConnections.get("legacy"))!.apiKey).toBe("");
    expect(vault.get("ai-connection:legacy")).toBe("sk-OLD");
  });
});
```
Run → FAIL. **Create `src/lib/db/repos/chat-secrets.ts`:**

```ts
import { db } from "@/lib/db";
import type { AiConnection } from "@/lib/db/schema";
import { deleteSecret, getSecret, secretsAvailable, setSecret } from "@/lib/secrets";

export const aiKeySecret = (id: string): string => `ai-connection:${id}`;

/** Fill `apiKey` from the secret store when the row holds a blank. */
export async function hydrateConnection(c: AiConnection): Promise<AiConnection> {
  if (!secretsAvailable() || c.apiKey) return c;
  const key = await getSecret(aiKeySecret(c.id));
  return key ? { ...c, apiKey: key } : c;
}

/** Persist the key as a secret and return the row to write (blank key). */
export async function stripConnectionSecret(c: AiConnection): Promise<AiConnection> {
  if (!secretsAvailable()) return c;
  if (c.apiKey) await setSecret(aiKeySecret(c.id), c.apiKey);
  return { ...c, apiKey: "" };
}

/** One-time move of plaintext keys written by v0.1 into the secret store. Idempotent. */
export async function migrateAiConnectionSecrets(): Promise<number> {
  if (!secretsAvailable()) return 0;
  let moved = 0;
  for (const row of await db.aiConnections.toArray()) {
    if (!row.apiKey) continue;
    await setSecret(aiKeySecret(row.id), row.apiKey);
    await db.aiConnections.update(row.id, { apiKey: "" });
    moved++;
  }
  return moved;
}

export async function removeConnectionSecret(id: string): Promise<void> {
  if (secretsAvailable()) await deleteSecret(aiKeySecret(id));
}
```
**Edit the `aiConnectionsRepo` object in `src/lib/db/repos/chat.ts`** (read the whole object first; it has `list`, `get`, `create`, `update`, `remove`): 
- `list()` → `return Promise.all((await db.aiConnections.orderBy("updatedAt").reverse().toArray()).map(hydrateConnection));`
- `get(id)` → `const c = await db.aiConnections.get(id); return c ? hydrateConnection(c) : undefined;` (make it `async`).
- `create(...)`: keep building `conn` exactly as today; replace `await db.aiConnections.add(conn)` with `await db.aiConnections.add(await stripConnectionSecret(conn));` and keep `return conn` (hydrated, because `conn` still holds the key).
- `update(id, patch)`: if `"apiKey" in patch`: `if (patch.apiKey) await setSecretFor(id, patch.apiKey)` else `await removeConnectionSecret(id)`, and write the row with `{ ...patch, apiKey: "" }` when `secretsAvailable()`; otherwise unchanged. (Use `setSecret(aiKeySecret(id), …)` imported from the helper module.)
- `remove(id)`: `await removeConnectionSecret(id);` before the delete.
- imports: `hydrateConnection, stripConnectionSecret, removeConnectionSecret, aiKeySecret` from `./chat-secrets`; `setSecret, secretsAvailable` from `@/lib/secrets`.

Run the new test → PASS. **Then find direct readers that would see blank keys:**
```bash
grep -rn "db\.aiConnections" src --include=*.ts --include=*.tsx | grep -v "repos/chat"
```
Expected after the change: **no output**. If any file reads `db.aiConnections` directly (e.g. a `useLiveQuery(() => db.aiConnections…)`), replace it by `aiConnectionsRepo.list()`/`get()`. Re-run `pnpm test && pnpm typecheck`.

Commit: `feat(security): AI provider keys move to the OS keychain (repo-level, migrated)`.

## P2.T8 — GitHub PAT and Obsidian key bindings (TDD, ≈8 min)

**Failing test `tests/unit/lib/secrets-binding.test.ts`:**

```ts
import { describe, it, expect, vi } from "vitest";
import { createStore } from "zustand/vanilla";

const vault = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/secrets", () => ({
  secretsAvailable: () => true,
  getSecret: async (k: string) => vault.get(k) ?? "",
  setSecret: async (k: string, v: string) => void vault.set(k, v),
  deleteSecret: async (k: string) => void vault.delete(k),
}));
import { bindSecretField } from "@/lib/secrets-binding";

const mk = (pat: string) => createStore<{ pat: string; owner: string }>(() => ({ pat, owner: "o" }));
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("bindSecretField", () => {
  it("migrates a legacy plaintext value into the vault and keeps the store value", async () => {
    vault.clear();
    const s = mk("legacy-token");
    await bindSecretField(s, "pat", "github:pat");
    expect(vault.get("github:pat")).toBe("legacy-token");
    expect(s.getState().pat).toBe("legacy-token");
  });
  it("hydrates an empty store from the vault", async () => {
    vault.clear();
    vault.set("github:pat", "from-vault");
    const s = mk("");
    await bindSecretField(s, "pat", "github:pat");
    expect(s.getState().pat).toBe("from-vault");
  });
  it("mirrors later changes and deletions", async () => {
    vault.clear();
    const s = mk("");
    await bindSecretField(s, "pat", "github:pat");
    s.setState({ pat: "new" });
    await tick();
    expect(vault.get("github:pat")).toBe("new");
    s.setState({ pat: "" });
    await tick();
    expect(vault.has("github:pat")).toBe(false);
  });
});
```
Run → FAIL. **Create `src/lib/secrets-binding.ts`:**

```ts
import type { StoreApi } from "zustand";
import { deleteSecret, getSecret, secretsAvailable, setSecret } from "@/lib/secrets";

/**
 * Keep one string field of a zustand store in the encrypted secret store.
 * - a legacy plaintext value found in the store is moved to the vault;
 * - an empty store is hydrated from the vault;
 * - later changes are mirrored (empty → delete).
 * Pair with `partialize` on the store's `persist` config so the field never reaches localStorage.
 * Returns an unsubscribe function.
 */
export async function bindSecretField<S extends object>(
  store: StoreApi<S>,
  field: keyof S & string,
  secretKey: string,
): Promise<() => void> {
  if (!secretsAvailable()) return () => {};
  const current = String(store.getState()[field] ?? "");
  if (current) {
    await setSecret(secretKey, current);
    // Force a persist write so the plaintext is dropped from localStorage (partialize excludes it).
    store.setState({} as Partial<S>);
  } else {
    const stored = await getSecret(secretKey);
    if (stored) store.setState({ [field]: stored } as unknown as Partial<S>);
  }
  let last = String(store.getState()[field] ?? "");
  return store.subscribe((s) => {
    const v = String(s[field] ?? "");
    if (v === last) return;
    last = v;
    void (v ? setSecret(secretKey, v) : deleteSecret(secretKey));
  });
}
```
Run → PASS.

**Edit the stores:**
- `src/lib/stores/github.ts`: in the `persist` options add `partialize: (s) => ({ owner: s.owner, repo: s.repo, branch: s.branch, lastSyncedAt: s.lastSyncedAt }),` and update the header comment to `The PAT is kept in the OS keychain (desktop) and sent only to the local /api/github proxy.` In a plain browser (no secret store) the PAT would no longer persist → make `partialize` conditional: `partialize: (s) => secretsAvailable() ? { owner…, lastSyncedAt… } : { pat: s.pat, owner…, lastSyncedAt… }` (import `secretsAvailable`).
- `src/lib/stores/obsidian.ts`: same pattern with `{ baseUrl }` / `{ baseUrl, apiKey }`.

**Create `src/components/shell/secrets-bootstrap.tsx`:**

```tsx
"use client";

import { useEffect } from "react";
import { migrateAiConnectionSecrets } from "@/lib/db/repos/chat-secrets";
import { bindSecretField } from "@/lib/secrets-binding";
import { useGithub } from "@/lib/stores/github";
import { useObsidianStore } from "@/lib/stores/obsidian";

/** Mount once: moves v0.1 plaintext credentials into the OS keychain and keeps them there. */
export function SecretsBootstrap() {
  useEffect(() => {
    let cancelled = false;
    const offs: Array<() => void> = [];
    void (async () => {
      await migrateAiConnectionSecrets();
      const gh = await bindSecretField(useGithub, "pat", "github:pat");
      const ob = await bindSecretField(useObsidianStore, "apiKey", "obsidian:api-key");
      if (cancelled) {
        gh();
        ob();
      } else offs.push(gh, ob);
    })();
    return () => {
      cancelled = true;
      offs.forEach((f) => f());
    };
  }, []);
  return null;
}
```
Mount `<SecretsBootstrap />` as the first child inside the outer `<div className="flex h-screen overflow-hidden">` of `src/app/(workspace)/layout.tsx` (shared-file rule applies). `pnpm test && pnpm typecheck && pnpm lint` → green.

Commit: `feat(security): GitHub PAT and Obsidian key live in the OS keychain`.

## P2.T9 — Black-box security check against the built server (≈10 min)

**Create `scripts/security-check.mjs`:**

```js
#!/usr/bin/env node
// Black-box check of the guard: boots the packaged Next server (desktop/app-server) with a token
// and asserts the denial matrix. Run: pnpm build:app && pnpm security:check
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "desktop", "app-server", "server.js");
const TOKEN = "t".repeat(64);

const port = await new Promise((res) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
});
const data = mkdtempSync(path.join(os.tmpdir(), "msf-sec-data-"));
const allowed = mkdtempSync(path.join(os.tmpdir(), "msf-sec-allowed-"));
const other = mkdtempSync(path.join(os.tmpdir(), "msf-sec-other-"));
writeFileSync(path.join(allowed, "hello.txt"), "hi");
writeFileSync(path.join(data, "roots.json"), JSON.stringify({ roots: [allowed] }));

const server = spawn(process.execPath, [entry], {
  env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", MASARFLOW_TOKEN: TOKEN, MASARFLOW_DATA_DIR: data, NODE_ENV: "production" },
  stdio: "ignore",
});
const stop = () => server.kill();
process.on("exit", stop);

function call({ method = "GET", p, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => { let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, json, text }); });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

for (let i = 0; i < 120; i++) {
  try { const r = await call({ p: "/api/health", headers: { "x-masarflow-token": TOKEN } }); if (r.status === 200) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const J = { "content-type": "application/json" };
const T = { "x-masarflow-token": TOKEN };
const O = { origin: "masarflow://app" };
const cases = [
  ["no token → 401", () => call({ p: "/api/health" }), (r) => r.status === 401],
  ["token → 200", () => call({ p: "/api/health", headers: T }), (r) => r.status === 200 && r.json?.ok === true],
  ["foreign Host → 403", () => call({ p: "/api/health", headers: { ...T, host: "evil.example" } }), (r) => r.status === 403],
  ["foreign Origin → 403", () => call({ method: "POST", p: "/api/fs/list", headers: { ...T, ...J, origin: "https://evil.example" }, body: JSON.stringify({ root: allowed, path: "" }) }), (r) => r.status === 403],
  ["POST without Origin → 403", () => call({ method: "POST", p: "/api/fs/list", headers: { ...T, ...J }, body: JSON.stringify({ root: allowed, path: "" }) }), (r) => r.status === 403],
  ["registered root → 200", () => call({ method: "POST", p: "/api/fs/list", headers: { ...T, ...J, ...O }, body: JSON.stringify({ root: allowed, path: "" }) }), (r) => r.status === 200],
  ["unregistered root → 403 (route-level)", () => call({ method: "POST", p: "/api/fs/list", headers: { ...T, ...J, ...O }, body: JSON.stringify({ root: other, path: "" }) }), (r) => r.status === 403 && /not been linked/.test(r.json?.error ?? "")],
  ["unregistered root on shell → 403", () => call({ method: "POST", p: "/api/fs/shell", headers: { ...T, ...J, ...O }, body: JSON.stringify({ root: other, command: "echo hi" }) }), (r) => r.status === 403],
  ["watch unregistered dir → 403", () => call({ p: `/api/watch?dir=${encodeURIComponent(other)}`, headers: T }), (r) => r.status === 403],
  ["no path is exempt from the token (former bridge path)", () => call({ method: "POST", p: "/api/opencode/ws-call", headers: J, body: "{}" }), (r) => r.status === 401 && String(r.json?.error ?? "").startsWith("MasarFlow guard:")],
];

let failed = 0;
for (const [name, run, ok] of cases) {
  let r;
  try { r = await run(); } catch (e) { r = { status: -1, text: String(e) }; }
  const pass = ok(r);
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (HTTP ${r.status})`);
}
stop();
if (failed) { console.error(`SECURITY_CHECK_FAIL ${failed}/${cases.length}`); process.exit(1); }
console.log(`SECURITY_CHECK_OK ${cases.length}/${cases.length}`);
```
Add to root `package.json`: `"security:check": "node scripts/security-check.mjs"`.

**Run:**
```bash
pnpm build:app 2>&1 | tail -3
pnpm security:check
```
Expected: 12 `PASS` lines then `SECURITY_CHECK_OK 12/12`. A failing line names the broken rule — fix the code, not the check. (If `fs/list` takes different body field names, read `src/app/api/fs/list/route.ts` first and adjust **the check**.)

Commit: `test(security): black-box guard matrix against the built server; P2 gate green`.

## P2.T10 — Prove the renderer's real Origin/Host pass the guard, in the packaged app (≈8 min)

**Why:** `security-check.mjs` sends hand-made headers. What Chromium actually sends from a privileged custom scheme (`Origin: masarflow://app`? `null`? nothing?) is **unverified** — if it is wrong, every POST in the shipped app fails with `MasarFlow guard:`. This task makes the packaged smoke test fail loudly in that case.

**Edit `desktop/src/main/index.ts`, function `runSmoke` (from P1.T5).** Above it add:

```ts
const SMOKE_ROOT = process.platform === "win32" ? "C:\\msf-smoke-unregistered" : "/msf-smoke-unregistered";
```
Replace the `executeJavaScript` call and the success branch with:

```ts
      const info = await win.webContents.executeJavaScript(
        `(async () => {
          const r = await fetch("/api/fs/list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ root: ${JSON.stringify(SMOKE_ROOT)}, path: "" }),
          });
          const j = await r.json().catch(() => ({}));
          return {
            path: location.pathname,
            origin: location.origin,
            hasApi: typeof window.masarflow === "object",
            guard: { status: r.status, error: String(j.error || "") },
          };
        })()`,
      );
      if (String(info.path).startsWith("/dashboard")) {
        clearTimeout(timer);
        // The POST must get past the guard (token + Host + Origin) and be refused by the ROOT allow-list.
        const guardOk = info.guard.status === 403 && /not been linked/.test(info.guard.error);
        finish({ ok: guardOk, ...info }, guardOk ? 0 : 1);
      }
```
**Edit `scripts/smoke-desktop.mjs`:** change the success condition to `r.ok && r.origin === "masarflow://app" && r.hasApi === true && r.guard?.status === 403`.

**Run:**
```bash
pnpm desktop:dist:dir && pnpm smoke:desktop
```
Expected (one line): `SMOKE_OK {"ok":true,"path":"/dashboard","origin":"masarflow://app","hasApi":true,"guard":{"status":403,"error":"This folder has not been linked on this computer. Choose it again with the folder picker."}}`

**If it prints `SMOKE_FAIL` with `"error":"MasarFlow guard: …"`:**
- `origin not allowed` or `state-changing requests must carry an allowed origin` → Chromium sends `null`/no Origin for the custom scheme. Fix in `desktop/src/main/backend/protocol.ts`: right after `headers.set(TOKEN_HEADER, opts.token);` add `if (request.method !== "GET" && request.method !== "HEAD") headers.set("origin", APP_ORIGIN);` (the proxy is the only entry point, so asserting the origin there is sound). Re-run.
- `host not allowed` → the proxied request carries a Host other than `127.0.0.1:<port>`; set `headers.set("host", new URL(opts.target).host)` in the same place. Re-run.
- `missing or invalid launch token` → the token header is not reaching Next; re-check P1.T4.

Commit: `test(desktop): packaged smoke proves renderer POSTs pass the guard and hit the root allow-list`.

---

# PHASE 3 — Runtime independence: no Python in the default product

**Goal:** semantic search + RAG work with zero external runtime, offline, inside the renderer (Web Worker + `@huggingface/transformers` + vectors in Dexie). The boot gate disappears. **Needs Spike S3 = GO** (its measured numbers and exact `env` property names override anything below).

## P3.T1 — Dexie v11 `embeddings` table (TDD, ≈5 min)

**Failing test `tests/unit/lib/db/embeddings-table.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("embeddings table (Dexie v11)", () => {
  it("stores Float32Array vectors and queries by project and by project+kind", async () => {
    await db.embeddings.bulkAdd([
      { id: "p1:note:n1:0", projectId: "p1", kind: "note", entityId: "n1", chunkIndex: 0, title: "A", text: "alpha", hash: "h1", vector: new Float32Array([1, 0, 0]) },
      { id: "p1:task:t1:0", projectId: "p1", kind: "task", entityId: "t1", chunkIndex: 0, title: "B", text: "beta", hash: "h2", vector: new Float32Array([0, 1, 0]) },
      { id: "p2:note:n9:0", projectId: "p2", kind: "note", entityId: "n9", chunkIndex: 0, title: "C", text: "gamma", hash: "h3", vector: new Float32Array([0, 0, 1]) },
    ]);
    const p1 = await db.embeddings.where("projectId").equals("p1").toArray();
    expect(p1).toHaveLength(2);
    expect(p1[0].vector).toBeInstanceOf(Float32Array);
    expect(await db.embeddings.where("[projectId+kind]").equals(["p1", "note"]).count()).toBe(1);
    expect(await db.embeddings.where("[projectId+entityId]").equals(["p1", "t1"]).count()).toBe(1);
  });
  it("is cleared by a full local wipe", async () => {
    const { resetData } = await import("@/lib/db/data");
    await db.embeddings.add({ id: "x", projectId: "p", kind: "note", entityId: "n", chunkIndex: 0, title: "", text: "", hash: "", vector: new Float32Array(1) });
    await resetData();
    expect(await db.embeddings.count()).toBe(0);
  });
});
```
Run → FAIL (`db.embeddings` undefined). **Edit `src/lib/db/schema.ts`** — append near the other table schemas:

```ts
/** One embedded text chunk of a workspace entity (rebuildable index — excluded from backups). */
export const embeddingSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: z.string(),
  entityId: z.string(),
  chunkIndex: z.number(),
  title: z.string(),
  text: z.string(),
  hash: z.string(),
  vector: z.custom<Float32Array>(),
});
export type EmbeddingRow = z.infer<typeof embeddingSchema>;
```
**Edit `src/lib/db/index.ts`:** import `EmbeddingRow` in the type import list; add `embeddings!: EntityTable<EmbeddingRow, "id">;` after `aiUndo!`; append after the `version(10)` block (inside the constructor):

```ts
    // v11: local semantic index (additive). Vectors are produced in-browser by the
    // embedding worker; the table is rebuildable and excluded from backups.
    this.version(11).stores({
      embeddings: "id, projectId, [projectId+kind], [projectId+entityId]",
    });
```
Run → PASS. `pnpm typecheck` clean. Commit: `feat(db): v11 embeddings table`.

## P3.T2 — Chunker port (TDD — the five Python tests, ≈5 min)

**Failing test `tests/unit/lib/ai/embeddings/chunking.test.ts`** (a 1:1 port of `python-service/tests/test_chunking.py`):

```ts
import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/ai/embeddings/chunking";

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
  it("keeps short text as a single chunk", () => {
    const text = "Just a short note about the login flow.";
    expect(chunkText(text, 1000)).toEqual([text]);
  });
  it("packs paragraphs until the budget is hit", () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `Paragraph ${i}. ${"word ".repeat(20)}`);
    const chunks = chunkText(paragraphs.join("\n\n"), 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < 6; i++) expect(chunks.some((c) => c.includes(`Paragraph ${i}.`))).toBe(true);
  });
  it("hard-splits an oversized paragraph with overlap", () => {
    const chunks = chunkText("x".repeat(500), 200, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i - 1].slice(-50)).toBe(chunks[i].slice(0, 50));
  });
  it("overlaps consecutive packed chunks", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Section ${i} content here with enough words to matter.`).join("\n\n");
    const chunks = chunkText(text, 120, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].includes(chunks[i - 1].slice(-30))).toBe(true);
  });
});
```
Run → FAIL. **Create `src/lib/ai/embeddings/chunking.ts`:**

```ts
export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_OVERLAP = 150;

/**
 * Paragraph-aware chunking with overlap (TypeScript port of python-service/app/chunking.py).
 * Paragraphs are packed greedily up to `chunkSize`; a single longer paragraph is hard-split by
 * character offset; consecutive chunks share the last `overlap` characters of their predecessor.
 */
export function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const paragraphs = trimmed.split("\n\n").map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) paragraphs.push(trimmed);

  const packed: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (para.length > chunkSize) {
      if (current) {
        packed.push(current);
        current = "";
      }
      packed.push(...hardSplit(para, chunkSize, overlap));
      continue;
    }
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > chunkSize) {
      packed.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current) packed.push(current);
  if (packed.length <= 1) return packed;

  const overlapped = [packed[0]];
  for (const chunk of packed.slice(1)) {
    const prev = overlapped[overlapped.length - 1];
    const tail = overlap && prev.length > overlap ? prev.slice(-overlap) : prev;
    overlapped.push(tail ? `${tail}\n\n${chunk}` : chunk);
  }
  return overlapped;
}

function hardSplit(text: string, chunkSize: number, overlap: number): string[] {
  const pieces: string[] = [];
  const step = Math.max(chunkSize - overlap, 1);
  for (let start = 0; start < text.length; start += step) pieces.push(text.slice(start, start + chunkSize));
  return pieces;
}
```
Run → PASS. Commit: `feat(ai): TypeScript chunker ported from the Python service`.

## P3.T3 — Vector math (TDD, ≈4 min)

**Failing test `tests/unit/lib/ai/embeddings/vector.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { cosine, topK } from "@/lib/ai/embeddings/vector";

const v = (...n: number[]) => new Float32Array(n);

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal, -1 for opposite, 0 for zero vectors", () => {
    expect(cosine(v(1, 2, 3), v(1, 2, 3))).toBeCloseTo(1, 5);
    expect(cosine(v(1, 0), v(0, 1))).toBeCloseTo(0, 5);
    expect(cosine(v(1, 0), v(-1, 0))).toBeCloseTo(-1, 5);
    expect(cosine(v(0, 0), v(1, 1))).toBe(0);
  });
  it("throws on a dimension mismatch", () => {
    expect(() => cosine(v(1, 2), v(1))).toThrow(/dimension/i);
  });
});

describe("topK", () => {
  const rows = [
    { id: "a", vector: v(1, 0) },
    { id: "b", vector: v(0.9, 0.1) },
    { id: "c", vector: v(0, 1) },
  ];
  it("returns the best rows in order, honouring k and minScore", () => {
    expect(topK(v(1, 0), rows, 2, 0).map((r) => r.row.id)).toEqual(["a", "b"]);
    expect(topK(v(1, 0), rows, 10, 0.5).map((r) => r.row.id)).toEqual(["a", "b"]);
    expect(topK(v(1, 0), rows, 0, 0)).toEqual([]);
  });
});
```
Run → FAIL. **Create `src/lib/ai/embeddings/vector.ts`:**

```ts
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Scored<T> {
  row: T;
  score: number;
}

/** Brute-force nearest neighbours: fine up to ~50k chunks (a few ms per 10k). */
export function topK<T extends { vector: Float32Array }>(
  query: Float32Array,
  rows: T[],
  k: number,
  minScore: number,
): Scored<T>[] {
  if (k <= 0) return [];
  const scored: Scored<T>[] = [];
  for (const row of rows) {
    const score = cosine(query, row.vector);
    if (score >= minScore) scored.push({ row, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
```
Run → PASS. Commit: `feat(ai): cosine + topK vector helpers`.

## P3.T4 — Embedder core, worker, client (TDD for core + client, ≈12 min)

**Failing test `tests/unit/lib/ai/embeddings/embedder-core.test.ts`:**

```ts
import { describe, it, expect, vi } from "vitest";
import { createEmbedderCore, EMBED_DIMENSIONS } from "@/lib/ai/embeddings/embedder-core";

/** Fake extractor: returns a row-major [n, 3] tensor where each row = [len, 1, 0]. */
const fakeExtractor = vi.fn(async (texts: string[]) => ({
  data: Float32Array.from(texts.flatMap((t) => [t.length, 1, 0])),
  dims: [texts.length, 3],
}));

describe("createEmbedderCore", () => {
  it("loads the model once and splits the tensor into one vector per text", async () => {
    const load = vi.fn(async () => fakeExtractor);
    const core = createEmbedderCore(load, { batchSize: 2 });
    const out = await core.embed(["a", "bb", "ccc"]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(3);
    expect(Array.from(out[2])).toEqual([3, 1, 0]);
    await core.embed(["d"]);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("batches", async () => {
    fakeExtractor.mockClear();
    const core = createEmbedderCore(async () => fakeExtractor, { batchSize: 2 });
    await core.embed(["a", "b", "c", "d", "e"]);
    expect(fakeExtractor).toHaveBeenCalledTimes(3);
  });
  it("returns [] for no input without loading the model", async () => {
    const load = vi.fn(async () => fakeExtractor);
    expect(await createEmbedderCore(load).embed([])).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
  it("reports status", async () => {
    const core = createEmbedderCore(async () => fakeExtractor);
    expect(core.status()).toEqual({ state: "idle", dimensions: EMBED_DIMENSIONS });
    await core.embed(["x"]);
    expect(core.status().state).toBe("ready");
  });
  it("surfaces a load failure as an error status and retries on the next call", async () => {
    let n = 0;
    const core = createEmbedderCore(async () => {
      if (++n === 1) throw new Error("model missing");
      return fakeExtractor;
    });
    await expect(core.embed(["x"])).rejects.toThrow("model missing");
    expect(core.status()).toMatchObject({ state: "error", error: "model missing" });
    await expect(core.embed(["x"])).resolves.toHaveLength(1);
  });
});
```
Run → FAIL. **Create `src/lib/ai/embeddings/embedder-core.ts`:**

```ts
export const EMBED_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIMENSIONS = 384;

export type Extractor = (
  texts: string[],
  opts: { pooling: "mean"; normalize: true },
) => Promise<{ data: Float32Array; dims: number[] }>;

export interface EmbedderStatus {
  state: "idle" | "loading" | "ready" | "error";
  dimensions: number;
  error?: string;
}

export interface EmbedderCore {
  embed(texts: string[]): Promise<Float32Array[]>;
  status(): EmbedderStatus;
}

/** Pure orchestration around a lazily-loaded extractor; the worker supplies the real one. */
export function createEmbedderCore(load: () => Promise<Extractor>, opts: { batchSize?: number } = {}): EmbedderCore {
  const batchSize = opts.batchSize ?? 16;
  let extractor: Promise<Extractor> | null = null;
  let status: EmbedderStatus = { state: "idle", dimensions: EMBED_DIMENSIONS };

  const ensure = (): Promise<Extractor> => {
    if (!extractor) {
      status = { state: "loading", dimensions: EMBED_DIMENSIONS };
      extractor = load().then(
        (ex) => {
          status = { state: "ready", dimensions: EMBED_DIMENSIONS };
          return ex;
        },
        (err) => {
          extractor = null;
          status = { state: "error", dimensions: EMBED_DIMENSIONS, error: err instanceof Error ? err.message : String(err) };
          throw err;
        },
      );
    }
    return extractor;
  };

  return {
    status: () => status,
    async embed(texts) {
      if (texts.length === 0) return [];
      const ex = await ensure();
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const tensor = await ex(batch, { pooling: "mean", normalize: true });
        const dim = tensor.dims[1];
        for (let r = 0; r < batch.length; r++) out.push(tensor.data.slice(r * dim, (r + 1) * dim));
      }
      return out;
    },
  };
}
```
Run → PASS.

**Failing test `tests/unit/lib/ai/embeddings/client.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { createEmbedClient, type WorkerLike } from "@/lib/ai/embeddings/client";

/** A worker that echoes: vector = [text.length]. */
function fakeWorker(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    postMessage(msg: { id: number; type: string; texts?: string[] }) {
      queueMicrotask(() => {
        if (msg.type === "embed") w.onmessage?.({ data: { id: msg.id, ok: true, vectors: msg.texts!.map((t) => new Float32Array([t.length])) } });
        else w.onmessage?.({ data: { id: msg.id, ok: true, status: { state: "ready", dimensions: 384 } } });
      });
    },
    terminate() {},
  };
  return w;
}

describe("createEmbedClient", () => {
  it("resolves concurrent requests to the right callers", async () => {
    const c = createEmbedClient(() => fakeWorker());
    const [a, b] = await Promise.all([c.embed(["aa"]), c.embed(["bbbb", "c"])]);
    expect(Array.from(a[0])).toEqual([2]);
    expect(b.map((v) => v[0])).toEqual([4, 1]);
  });
  it("creates the worker lazily and only once", async () => {
    let created = 0;
    const c = createEmbedClient(() => (created++, fakeWorker()));
    expect(created).toBe(0);
    await c.embed(["x"]);
    await c.embed(["y"]);
    expect(created).toBe(1);
  });
  it("rejects when the worker reports an error", async () => {
    const bad: WorkerLike = {
      onmessage: null,
      postMessage(msg: { id: number }) {
        queueMicrotask(() => bad.onmessage?.({ data: { id: msg.id, ok: false, error: "boom" } }));
      },
      terminate() {},
    };
    await expect(createEmbedClient(() => bad).embed(["x"])).rejects.toThrow("boom");
  });
  it("exposes status", async () => {
    const c = createEmbedClient(() => fakeWorker());
    expect((await c.status()).state).toBe("ready");
  });
});
```
Run → FAIL. **Create `src/lib/ai/embeddings/client.ts`:**

```ts
import type { EmbedderStatus } from "./embedder-core";

export interface WorkerLike {
  onmessage: ((e: { data: WorkerResponse }) => void) | null;
  postMessage(msg: WorkerRequest): void;
  terminate(): void;
}

export type WorkerRequest = { id: number; type: "embed"; texts: string[] } | { id: number; type: "status" };
export type WorkerResponse =
  | { id: number; ok: true; vectors?: Float32Array[]; status?: EmbedderStatus }
  | { id: number; ok: false; error: string };

export interface EmbedClient {
  embed(texts: string[]): Promise<Float32Array[]>;
  status(): Promise<EmbedderStatus>;
}

export function createEmbedClient(makeWorker: () => WorkerLike): EmbedClient {
  let worker: WorkerLike | null = null;
  let nextId = 1;
  type Ok = Extract<WorkerResponse, { ok: true }>;
  type CallArgs = { type: "embed"; texts: string[] } | { type: "status" };
  const pending = new Map<number, { resolve: (r: Ok) => void; reject: (e: Error) => void }>();

  const ensure = (): WorkerLike => {
    if (worker) return worker;
    worker = makeWorker();
    worker.onmessage = (e) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg);
      else p.reject(new Error(msg.error));
    };
    return worker;
  };

  const call = (req: CallArgs): Promise<Ok> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ensure().postMessage({ ...req, id } as WorkerRequest);
    });

  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      return (await call({ type: "embed", texts })).vectors ?? [];
    },
    async status() {
      return (await call({ type: "status" })).status ?? { state: "idle", dimensions: 384 };
    },
  };
}

let shared: EmbedClient | null = null;

/** App-wide client backed by the real module worker (browser only). */
export function getEmbedClient(): EmbedClient {
  shared ??= createEmbedClient(
    () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike,
  );
  return shared;
}
```
Run → PASS.

**Create `src/lib/ai/embeddings/worker.ts`** (no unit test — runs only in a browser; verified by P3.T9; adjust the `env.*` lines to whatever Spike S3 proved):

```ts
/// <reference lib="webworker" />
import { env, pipeline } from "@huggingface/transformers";
import { EMBED_MODEL_ID, createEmbedderCore, type Extractor } from "./embedder-core";
import type { WorkerRequest, WorkerResponse } from "./client";

// Fully offline: the model and the ONNX WASM runtime are served from /public (copied into the app bundle).
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = "/ort/";
  env.backends.onnx.wasm.numThreads = 1; // no cross-origin isolation => no SharedArrayBuffer
}

const core = createEmbedderCore(
  async () => (await pipeline("feature-extraction", EMBED_MODEL_ID, { dtype: "q8", device: "wasm" })) as unknown as Extractor,
);

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
};

ctx.onmessage = async (e) => {
  const req = e.data;
  try {
    if (req.type === "embed") {
      const vectors = await core.embed(req.texts);
      ctx.postMessage({ id: req.id, ok: true, vectors }, vectors.map((v) => v.buffer));
    } else {
      ctx.postMessage({ id: req.id, ok: true, status: core.status() });
    }
  } catch (err) {
    ctx.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
```
**Assets pipeline.** Create `scripts/copy-ort.mjs`:

```js
#!/usr/bin/env node
// Copies the onnxruntime-web WASM runtime next to the app so the embedding worker works offline.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules", "onnxruntime-web", "dist");
const to = path.join(root, "public", "ort");
if (!existsSync(from)) { console.error("onnxruntime-web is not installed — run `pnpm install`."); process.exit(1); }
mkdirSync(to, { recursive: true });
let n = 0;
for (const f of readdirSync(from)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) { cpSync(path.join(from, f), path.join(to, f)); n++; }
}
console.log(`copied ${n} ONNX runtime file(s) to public/ort`);
```
Add `/public/ort/` to `.gitignore`. In root `package.json`: `"assets:embeddings": "node scripts/fetch-embedding-model.mjs && node scripts/copy-ort.mjs"` and change `"build:app"` to `"pnpm assets:embeddings && next build && node scripts/build-app-server.mjs"`. If `onnxruntime-web` is not a direct dependency (pnpm hides transitive deps), `pnpm add onnxruntime-web` with the **same version** that `@huggingface/transformers` depends on: `pnpm why onnxruntime-web` shows it.

Run `pnpm assets:embeddings` → expect `copied N ONNX runtime file(s)` (N ≥ 2) and `public/models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx` present (`ls -l` ≈ 22–23 MB).

`pnpm test && pnpm typecheck && pnpm lint` → green. Commit: `feat(ai): in-browser embedder (worker + client) and offline model assets`.

## P3.T5 — Indexer (TDD, ≈10 min)

**Failing test `tests/unit/lib/ai/embeddings/indexer.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { notesRepo } from "@/lib/db/repos";
import { reindexProject } from "@/lib/ai/embeddings/indexer";

const embed = vi.fn(async (texts: string[]) => texts.map((t) => new Float32Array([t.length, 1, 0])));
const deps = () => ({ embed });

beforeEach(async () => {
  embed.mockClear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("reindexProject", () => {
  it("embeds new items, skips unchanged ones, re-embeds edits and removes deletions", async () => {
    const n = await notesRepo.create({ projectId: "p1", title: "Auth", body: "JWT refresh rotation." });
    const r1 = await reindexProject("p1", deps());
    expect(r1).toMatchObject({ added: 1, removed: 0 });
    expect(await db.embeddings.where("projectId").equals("p1").count()).toBe(1);

    embed.mockClear();
    const r2 = await reindexProject("p1", deps());
    expect(r2).toMatchObject({ added: 0, removed: 0, unchanged: 1 });
    expect(embed).not.toHaveBeenCalled();

    await notesRepo.update(n.id, { body: "JWT refresh rotation, now with revocation." });
    const r3 = await reindexProject("p1", deps());
    expect(r3).toMatchObject({ added: 1, removed: 1 });

    await notesRepo.remove(n.id);
    const r4 = await reindexProject("p1", deps());
    expect(r4).toMatchObject({ added: 0, removed: 1 });
    expect(await db.embeddings.where("projectId").equals("p1").count()).toBe(0);
  });
  it("never touches another project's vectors", async () => {
    await notesRepo.create({ projectId: "p1", title: "One", body: "a" });
    await notesRepo.create({ projectId: "p2", title: "Two", body: "b" });
    await reindexProject("p1", deps());
    await reindexProject("p2", deps());
    await reindexProject("p1", deps());
    expect(await db.embeddings.where("projectId").equals("p2").count()).toBe(1);
  });
  it("splits long bodies into several chunks with stable ids", async () => {
    await notesRepo.create({ projectId: "p1", title: "Long", body: Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ${"word ".repeat(40)}`).join("\n\n") });
    await reindexProject("p1", deps());
    const rows = await db.embeddings.where("projectId").equals("p1").toArray();
    expect(rows.length).toBeGreaterThan(3);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.id.startsWith("p1:note:"))).toBe(true);
  });
});
```
`notesRepo` exposes `create`, `update`, `remove` (verified in `src/lib/db/repos/notes.ts`). Run → FAIL. **Create `src/lib/ai/embeddings/indexer.ts`:**

```ts
import { db } from "@/lib/db";
import type { EmbeddingRow } from "@/lib/db/schema";
import { hashContent } from "@/lib/sync";
import { buildSearchItems } from "@/lib/utils/search";
import { chunkText } from "./chunking";
import { getEmbedClient } from "./client";
import { bumpIndexVersion } from "./search";

export interface IndexDeps {
  embed: (texts: string[]) => Promise<Float32Array[]>;
}

export interface IndexResult {
  added: number;
  removed: number;
  unchanged: number;
}

interface Wanted {
  id: string;
  kind: string;
  entityId: string;
  chunkIndex: number;
  title: string;
  text: string;
  hash: string;
}

export async function reindexProject(
  projectId: string,
  deps: IndexDeps = { embed: (t) => getEmbedClient().embed(t) },
): Promise<IndexResult> {
  if (!projectId) return { added: 0, removed: 0, unchanged: 0 };

  const wanted = new Map<string, Wanted>();
  for (const item of await buildSearchItems(projectId)) {
    const full = [item.title, item.subtitle, item.body].filter(Boolean).join("\n\n");
    chunkText(full).forEach((text, chunkIndex) => {
      const id = `${projectId}:${item.kind}:${item.id}:${chunkIndex}`;
      wanted.set(id, { id, kind: item.kind, entityId: item.id, chunkIndex, title: item.title, text, hash: hashContent(`${item.title}\u0000${text}`) });
    });
  }

  const existing = await db.embeddings.where("projectId").equals(projectId).toArray();
  const have = new Map(existing.map((r) => [r.id, r.hash]));
  const toEmbed = [...wanted.values()].filter((w) => have.get(w.id) !== w.hash);
  const toRemove = existing.filter((r) => !wanted.has(r.id)).map((r) => r.id);
  const replaced = toEmbed.filter((w) => have.has(w.id)).length;

  for (let i = 0; i < toEmbed.length; i += 32) {
    const batch = toEmbed.slice(i, i + 32);
    const vectors = await deps.embed(batch.map((b) => `${b.title}\n${b.text}`));
    const rows: EmbeddingRow[] = batch.map((b, k) => ({ ...b, projectId, vector: vectors[k] }));
    await db.embeddings.bulkPut(rows);
  }
  if (toRemove.length) await db.embeddings.bulkDelete(toRemove);
  if (toEmbed.length || toRemove.length) bumpIndexVersion(projectId);

  // An edited chunk counts as one removed (the old vector) and one added (the new vector).
  return { added: toEmbed.length, removed: toRemove.length + replaced, unchanged: wanted.size - toEmbed.length };
}
```
The counters are pinned by the test: a **new** chunk counts `added`; an **edited** chunk counts `added` and `removed`; a **deleted** chunk counts `removed`.

`indexer.ts` imports `bumpIndexVersion` from `./search`, so create `search.ts` in P3.T6 **before** running this test, or temporarily stub: create `src/lib/ai/embeddings/search.ts` with only `export function bumpIndexVersion(_projectId: string): void {}` now and replace it in T6 (commit separately). Run the indexer test → PASS.

**Replace `src/lib/ai/embedding-sync.ts`** wholesale with a façade that keeps its three public names (the layout imports them):

```ts
import { reindexProject as reindex } from "@/lib/ai/embeddings/indexer";

/**
 * Keeps the local semantic index current. The index lives in IndexedDB and is produced by an
 * in-browser embedding worker — no external service involved.
 */
const PERIODIC_INTERVAL_MS = 10 * 60 * 1000;

/** Reindex one project. Never throws. */
export async function reindexProject(projectId: string): Promise<void> {
  try {
    await reindex(projectId);
  } catch (err) {
    console.warn("[embeddings] reindex failed", err);
  }
}

let periodicTimer: ReturnType<typeof setInterval> | null = null;

export function startPeriodicEmbeddingSync(getProjectId: () => string | null): void {
  if (periodicTimer) clearInterval(periodicTimer);
  const run = () => {
    const id = getProjectId();
    if (id) void reindexProject(id);
  };
  setTimeout(run, 3_000); // first pass shortly after boot
  periodicTimer = setInterval(run, PERIODIC_INTERVAL_MS);
}

export function stopPeriodicEmbeddingSync(): void {
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = null;
}
```
**Delete** `tests/unit/lib/ai/embedding-sync.test.ts` (it tested the Python bridge; `indexer.test.ts` replaces it).

`pnpm test` → green. Commit: `feat(ai): local incremental indexer replaces the Python embedding sync`.

## P3.T6 — Semantic search + RAG retrieval (TDD, ≈10 min)

**Failing test `tests/unit/lib/ai/embeddings/search.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { semanticSearch, retrieveRagChunks, bumpIndexVersion } from "@/lib/ai/embeddings/search";

/** Toy 3-d "embedding": [mentions auth, mentions game, mentions food]. */
const toy = (t: string): Float32Array => {
  const s = t.toLowerCase();
  const v = [/auth|login|token|jwt/.test(s) ? 1 : 0, /game|level|player/.test(s) ? 1 : 0, /cake|recipe|food/.test(s) ? 1 : 0];
  return new Float32Array(v.some(Boolean) ? v : [0.01, 0.01, 0.01]);
};
const deps = { embed: async (texts: string[]) => texts.map(toy) };

async function seed(): Promise<void> {
  await db.embeddings.bulkAdd([
    { id: "p1:note:n1:0", projectId: "p1", kind: "note", entityId: "n1", chunkIndex: 0, title: "Login flow", text: "JWT login and token refresh", hash: "a", vector: toy("jwt login") },
    { id: "p1:note:n1:1", projectId: "p1", kind: "note", entityId: "n1", chunkIndex: 1, title: "Login flow", text: "Token expiry rules for auth", hash: "b", vector: toy("token auth") },
    { id: "p1:task:t1:0", projectId: "p1", kind: "task", entityId: "t1", chunkIndex: 0, title: "Level design", text: "Design the first game level", hash: "c", vector: toy("game level") },
    { id: "p2:note:x:0", projectId: "p2", kind: "note", entityId: "x", chunkIndex: 0, title: "Other project", text: "auth", hash: "d", vector: toy("auth") },
  ]);
  bumpIndexVersion("p1");
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("semanticSearch", () => {
  it("ranks by meaning, collapses chunks to one hit per entity, and stays inside the project", async () => {
    await seed();
    const hits = await semanticSearch("p1", "how do users log in with a token", 5, deps);
    expect(hits.map((h) => `${h.kind}:${h.id}`)).toEqual(["note:n1"]);
    expect(hits[0].score).toBeGreaterThan(0.5);
  });
  it("returns nothing for an unrelated query (min score)", async () => {
    await seed();
    expect(await semanticSearch("p1", "chocolate cake recipe", 5, deps)).toEqual([]);
  });
  it("returns [] for a blank query or an unindexed project", async () => {
    expect(await semanticSearch("p1", "   ", 5, deps)).toEqual([]);
    expect(await semanticSearch("nope", "auth", 5, deps)).toEqual([]);
  });
});

describe("retrieveRagChunks", () => {
  it("returns the best chunks (not collapsed) within the character budget", async () => {
    await seed();
    const chunks = await retrieveRagChunks("p1", "token auth", 6, 10_000, deps);
    expect(chunks.map((c) => c.entityId)).toContain("n1");
    expect(chunks[0]).toMatchObject({ kind: "note", entityId: "n1", title: "Login flow" });
    const tiny = await retrieveRagChunks("p1", "token auth", 6, 20, deps);
    expect(tiny.length).toBeLessThanOrEqual(1);
  });
});
```
Run → FAIL (the T5 stub lacks these). **Replace `src/lib/ai/embeddings/search.ts`:**

```ts
import { db } from "@/lib/db";
import type { EmbeddingRow } from "@/lib/db/schema";
import { getEmbedClient } from "./client";
import { topK } from "./vector";

/** Below this cosine similarity a chunk is noise for MiniLM-class embeddings. */
export const MIN_SCORE = 0.25;

export interface SearchDeps {
  embed: (texts: string[]) => Promise<Float32Array[]>;
}
const defaultDeps = (): SearchDeps => ({ embed: (t) => getEmbedClient().embed(t) });

export interface SemanticHit {
  id: string;
  kind: string;
  score: number;
}

export interface RagChunk {
  entityId: string;
  kind: string;
  title: string;
  text: string;
  score: number;
}

const versions = new Map<string, number>();
const cache = new Map<string, { version: number; rows: EmbeddingRow[] }>();

/** Called by the indexer after it writes, so the in-memory copy is reloaded. */
export function bumpIndexVersion(projectId: string): void {
  versions.set(projectId, (versions.get(projectId) ?? 0) + 1);
}

async function rowsFor(projectId: string): Promise<EmbeddingRow[]> {
  const version = versions.get(projectId) ?? 0;
  const hit = cache.get(projectId);
  if (hit && hit.version === version) return hit.rows;
  const rows = await db.embeddings.where("projectId").equals(projectId).toArray();
  cache.set(projectId, { version, rows });
  return rows;
}

async function embedQuery(query: string, deps: SearchDeps): Promise<Float32Array | null> {
  const q = query.trim();
  if (!q) return null;
  const [v] = await deps.embed([q]);
  return v ?? null;
}

/** One hit per entity (its best chunk), best first. */
export async function semanticSearch(
  projectId: string,
  query: string,
  limit: number,
  deps: SearchDeps = defaultDeps(),
): Promise<SemanticHit[]> {
  const rows = await rowsFor(projectId);
  if (rows.length === 0) return [];
  const qv = await embedQuery(query, deps);
  if (!qv) return [];
  const seen = new Set<string>();
  const hits: SemanticHit[] = [];
  for (const { row, score } of topK(qv, rows, rows.length, MIN_SCORE)) {
    const key = `${row.kind}:${row.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ id: row.entityId, kind: row.kind, score });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Best chunks (not collapsed) until `budgetChars` is used up. */
export async function retrieveRagChunks(
  projectId: string,
  query: string,
  topChunks: number,
  budgetChars: number,
  deps: SearchDeps = defaultDeps(),
): Promise<RagChunk[]> {
  const rows = await rowsFor(projectId);
  if (rows.length === 0) return [];
  const qv = await embedQuery(query, deps);
  if (!qv) return [];
  const out: RagChunk[] = [];
  let used = 0;
  for (const { row, score } of topK(qv, rows, topChunks, MIN_SCORE)) {
    if (used + row.text.length > budgetChars && out.length > 0) break;
    if (row.text.length > budgetChars) break;
    used += row.text.length;
    out.push({ entityId: row.entityId, kind: row.kind, title: row.title, text: row.text, score });
  }
  return out;
}
```
Run → PASS (also re-run `indexer.test.ts`). Commit: `feat(ai): local semantic search and RAG chunk retrieval`.

## P3.T7 — Point every consumer at the local index (≈12 min)

1. **`src/lib/ai/context.ts`** — replace the body of `fetchRagChunks` (lines ≈414–444) with a local call that keeps the `RagChunk` contract the formatter expects (`kind: "note" | "doc"`; **widened in P5.T10**, until then keep only these two kinds so output is unchanged):

```ts
async function fetchRagChunks(
  projectId: string,
  query: string,
  topK: number,
  signal?: AbortSignal,
): Promise<RagChunk[] | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const work = retrieveRagChunks(projectId, query, topK * 3, RAG_BUDGET_CHARS);
    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error("rag timeout")), 6000);
      signal?.addEventListener("abort", () => (clearTimeout(t), reject(new Error("aborted"))), { once: true });
    });
    const chunks = await Promise.race([work, timeout]);
    const usable = chunks.filter((c): c is RagChunk & { kind: "note" | "doc" } => c.kind === "note" || c.kind === "doc");
    return usable.length ? usable : undefined;
  } catch {
    return undefined;
  }
}
```
 Add `import { retrieveRagChunks } from "@/lib/ai/embeddings/search";` and rename the imported type if it clashes (`RagChunk` is declared in `context.ts` — keep that declaration; the filter above narrows the library type to it).
2. **`src/lib/ai/tools.ts`** `search_workspace` (lines ≈160–207): replace the `fetch("/api/python/search", …)` block by:

```ts
        let ranked: SearchItem[] | null = null;
        try {
          const hits = await semanticSearch(projectId, query, limit);
          if (hits.length) {
            const byKey = new Map(items.map((it) => [`${it.kind}:${it.id}`, it]));
            ranked = hits.map((h) => byKey.get(`${h.kind}:${h.id}`)).filter((it): it is SearchItem => Boolean(it));
          }
        } catch {
          ranked = null;
        }
```
 and import `semanticSearch`. The Fuse fallback below stays untouched.
3. **`src/components/search/search-view.tsx`** (lines ≈98 and ≈124): read the file; replace the health probe with `getEmbedClient().status()` (show "Semantic index: ready / loading / unavailable") and the `/api/python/search` call with `semanticSearch(projectId, query, 25)`; keep the Fuse fallback; map `SemanticHit` → `SearchItem` through the `buildSearchItems` list exactly as in (2).
4. **`src/components/settings/settings-view.tsx`**: replace the Python card (≈ lines 1440–1560, anchor on `fetch("/api/python/health")` and the `description="The local Python service…"` line) with `<SemanticIndexCard />` (created next) and delete the Python-only state/handlers above it that become unused (the linter will list them).

**Create `src/components/settings/semantic-index-card.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Loader2, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { getEmbedClient } from "@/lib/ai/embeddings/client";
import type { EmbedderStatus } from "@/lib/ai/embeddings/embedder-core";
import { reindexProject } from "@/lib/ai/embeddings/indexer";
import { useProjectStore } from "@/lib/stores/project";

export function SemanticIndexCard() {
  const projectId = useProjectStore((s) => s.activeProjectId);
  const count = useLiveQuery(() => (projectId ? db.embeddings.where("projectId").equals(projectId).count() : 0), [projectId]);
  const [status, setStatus] = useState<EmbedderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const poll = () => getEmbedClient().status().then((s) => live && setStatus(s)).catch(() => undefined);
    void poll();
    const t = setInterval(poll, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  async function rebuild() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await db.embeddings.where("projectId").equals(projectId).delete();
      await reindexProject(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const label =
    status?.state === "ready" ? "Ready" : status?.state === "loading" ? "Loading the model…" : status?.state === "error" ? "Unavailable" : "Idle";

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="semantic-index-title">
      <h3 id="semantic-index-title" className="text-sm font-semibold">Semantic index</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Meaning-based search and chat context run entirely on this computer. No data leaves the application.
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div><dt className="text-muted-foreground">Model</dt><dd data-testid="semantic-status">{label}</dd></div>
        <div><dt className="text-muted-foreground">Indexed passages</dt><dd data-testid="semantic-count">{count ?? 0}</dd></div>
        <div><dt className="text-muted-foreground">Dimensions</dt><dd>{status?.dimensions ?? 384}</dd></div>
      </dl>
      {status?.error || error ? <p className="mt-2 text-xs text-destructive" role="alert">{error ?? status?.error}</p> : null}
      <Button className="mt-3" size="sm" variant="outline" onClick={rebuild} disabled={busy || !projectId}>
        {busy ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <RefreshCw className="mr-2 size-3.5" />}
        Rebuild index
      </Button>
    </section>
  );
}
```
Verify the `Button` props (`size`, `variant`) against `src/components/ui/button.tsx` before pasting.

**Verify:** `pnpm typecheck && pnpm lint && pnpm test`; `grep -rn "api/python" src --include=*.ts --include=*.tsx | grep -v "src/app/api/python" | grep -v "src/lib/hooks/use-python-health" | grep -v "src/components/shell/python-required-screen"` → **no output** (remaining hits are deleted in T8). Commit: `refactor(ai): chat context, search tool, search page and settings use the local index`.

## P3.T8 — Remove the boot gate and the dead Python surface (≈10 min)

1. **`src/app/(workspace)/layout.tsx`:** delete the imports of `PythonRequiredScreen` and `usePythonHealth`, the line `const { state: pythonState } = usePythonHealth();`, and the whole block `// Hard boot gate… if (pythonState !== "ok") { return <PythonRequiredScreen />; }`. Update the comment above the embedding effect to: `// Background reindex of the local semantic index (runs in a worker, never blocks the UI).`
2. **Delete:** `src/components/shell/python-required-screen.tsx`, `src/lib/hooks/use-python-health.ts`, `src/lib/python/` (both files), `src/app/api/python/` (all 11 route folders/files incl. `_shared.ts`).
3. **Verify nothing references them:**
```bash
grep -rIl "api/python\|use-python-health\|lib/python\|PythonRequiredScreen" src tests scripts desktop/src 2>/dev/null
```
Expected: no output (the only allowed hit is `scripts/start.mjs` until T9).
4. `pnpm typecheck && pnpm lint && pnpm test` → green. (`pnpm lint` stays at 0 errors; the four existing `no-img-element` warnings are fixed in P8.)

Commit: `feat!: remove the Python boot gate and the dead Python API proxies`.

## P3.T9 — Lean start script, package scripts, e2e proof (≈12 min)

1. **Replace `scripts/start.mjs`** (798 lines → thin wrapper; the desktop app owns process orchestration now — Python launching removed; OpenCode no longer exists):

```js
#!/usr/bin/env node
/**
 * Browser-mode runner for contributors and e2e tests: `next start` (or `next dev` with --dev).
 * The desktop app (desktop/src/main) is the supported way to run MasarFlow.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const nextCli = require.resolve("next/dist/bin/next");
const dev = process.argv.includes("--dev");
const port = process.env.PORT ?? "3000";

const child = spawn(process.execPath, [nextCli, dev ? "dev" : "start", "-p", port], { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
```
 In root `package.json` **remove** the `setup:python` script; keep `start`, `dev:full`, `tools:install`.
2. **Playwright e2e for the index.** First read `tests/e2e/smoke.spec.ts` (169 lines) for its helpers (how it creates/selects a project, the base URL). Create `tests/e2e/semantic-index.spec.ts` with one test titled `/settings: semantic index builds locally and finds by meaning`:
   - create a project (reuse the smoke helper), then via the UI create a note titled `Login flow` with body `Users sign in with a JWT access token that expires after fifteen minutes.` and a second note `Cake` with body `Chocolate cake needs eggs, flour and cocoa.`;
   - open `/settings`, wait until `[data-testid="semantic-status"]` has text `Ready` (timeout 120 000 ms — the first run loads a 23 MB model) and `[data-testid="semantic-count"]` is `2` or greater (the periodic job fires 3 s after boot; if still `0` click **Rebuild index**);
   - open `/search`, type `how do people authenticate`, expect the first result to contain `Login flow` and no result `Cake`.
   - add the title to `tests/e2e/feature-matrix.json` under `"/settings": ["semantic index builds locally and finds by meaning"]`.
3. **Run:**
```bash
pnpm build
pnpm e2e -- semantic-index.spec.ts      # expect: 1 passed
pnpm test                                # includes the feature-matrix guard: green
```
4. **Offline proof (manual, once):** disable the network adapter, restart the app (`pnpm desktop:dist:dir` build), open `/settings` → status reaches `Ready` and `/search` still ranks by meaning. Record in the commit body.

**P3 gate:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm desktop:dist:dir && pnpm smoke:desktop` (`SMOKE_OK`; the smoke now passes **without any Python installed** — verify on a shell where `python`/`python3` are not on PATH: `PATH=/usr/bin:/bin pnpm smoke:desktop` is not portable on Windows; instead rename `python-service/.venv` away and confirm the app still boots).

Commit: `feat: browser-mode runner without Python; local semantic index e2e; P3 gate green`.

---

# PHASE 4 — Data safety: export/import, automatic backups, recovery

**Why first-class:** IndexedDB is the *only* copy of user data; clearing site data, a profile change or a failed upgrade loses everything. Before any destructive feature ships, users need: manual export/import, silent rolling disk backups, and a recovery screen.

## P4.T1 — Backup file format + export (TDD, ≈10 min)

**Failing test `tests/unit/lib/db/backup-export.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { exportBackup, serializeBackup, BACKUP_FORMAT, BACKUP_VERSION } from "@/lib/db/backup";
import { notesRepo, projectsRepo } from "@/lib/db/repos";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("exportBackup", () => {
  it("captures every table row with a versioned envelope", async () => {
    const p = await projectsRepo.create({ name: "Game" });
    await notesRepo.create({ projectId: p.id, title: "Idea", body: "Dash ability" });
    const file = await exportBackup(db, "0.2.0.0");
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.version).toBe(BACKUP_VERSION);
    expect(file.appVersion).toBe("0.2.0.0");
    expect(file.dexieVersion).toBe(db.verno);
    expect(file.tables.projects).toHaveLength(1);
    expect(file.tables.notes).toHaveLength(1);
  });
  it("excludes the rebuildable embeddings table", async () => {
    await db.embeddings.add({ id: "e", projectId: "p", kind: "note", entityId: "n", chunkIndex: 0, title: "", text: "", hash: "", vector: new Float32Array(2) });
    const file = await exportBackup(db, "x");
    expect("embeddings" in file.tables).toBe(false);
  });
  it("never exports provider API keys", async () => {
    await db.aiConnections.add({ id: "c", providerId: "openai", label: "L", apiKey: "sk-SECRET", baseUrl: "", createdAt: 1, updatedAt: 1 });
    const text = serializeBackup(await exportBackup(db, "x"));
    expect(text).not.toContain("sk-SECRET");
  });
  it("encodes Blobs (attachments) as base64 and keeps them restorable", async () => {
    await db.attachments.add({ id: "a", projectId: "p", name: "n.txt", mimeType: "text/plain", size: 5, blob: new Blob(["hello"], { type: "text/plain" }), createdAt: 1 });
    const file = await exportBackup(db, "x");
    const row = file.tables.attachments[0] as { blob: { __type: string; mime: string; data: string } };
    expect(row.blob.__type).toBe("blob");
    expect(row.blob.mime).toBe("text/plain");
    expect(atob(row.blob.data)).toBe("hello");
  });
});
```
`projectsRepo.create` takes `{ name, ...partial }` and `notesRepo.create` takes `{ projectId, title, body?, type?, folderId?, tags? }` (verified). Run → FAIL. If, after the implementation below, only the Blob test fails because `fake-indexeddb` cannot structured-clone a `Blob` in this Node version, move that single test into `tests/e2e/backup.spec.ts` (real browser) and keep the others unit-level — say so in the commit message. **Create `src/lib/db/backup.ts`:**

```ts
import type { MasarFlowDB } from "@/lib/db";

export const BACKUP_FORMAT = "masarflow-backup";
export const BACKUP_VERSION = 1;

/** Rebuildable data that is not worth shipping in a backup. */
const EXCLUDED_TABLES = new Set(["embeddings"]);

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  /** Dexie schema version of the exporting database. */
  dexieVersion: number;
  exportedAt: number;
  tables: Record<string, unknown[]>;
}

/* ── value encoding (JSON cannot carry Blob / typed arrays) ─────────────── */

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encodeValue(v: unknown): Promise<unknown> {
  if (v instanceof Blob) {
    return { __type: "blob", mime: v.type, data: bytesToBase64(new Uint8Array(await v.arrayBuffer())) };
  }
  if (v instanceof ArrayBuffer) return { __type: "bytes", data: bytesToBase64(new Uint8Array(v)) };
  if (ArrayBuffer.isView(v)) {
    return { __type: "bytes", data: bytesToBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  }
  if (Array.isArray(v)) return Promise.all(v.map(encodeValue));
  if (v && typeof v === "object") {
    const entries = await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await encodeValue(x)] as const));
    return Object.fromEntries(entries);
  }
  return v;
}

export function decodeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeValue);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.__type === "blob" && typeof o.data === "string") return new Blob([base64ToBytes(o.data)], { type: String(o.mime ?? "") });
    if (o.__type === "bytes" && typeof o.data === "string") return base64ToBytes(o.data).buffer;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decodeValue(x)]));
  }
  return v;
}

/** Credentials never leave the machine inside a backup file. */
function redactRow(table: string, row: unknown): unknown {
  if (table === "aiConnections" && row && typeof row === "object") return { ...(row as object), apiKey: "" };
  return row;
}

export async function exportBackup(db: MasarFlowDB, appVersion: string): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    if (EXCLUDED_TABLES.has(table.name)) continue;
    const rows = await table.toArray();
    tables[table.name] = await Promise.all(rows.map((r) => encodeValue(redactRow(table.name, r))));
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion, dexieVersion: db.verno, exportedAt: Date.now(), tables };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file);
}
```
Run → PASS. Commit: `feat(data): versioned backup export (blobs encoded, keys redacted)`.

## P4.T2 — Import: validation, replace and merge (TDD, ≈10 min)

**Failing test `tests/unit/lib/db/backup-import.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { BACKUP_FORMAT, BACKUP_VERSION, exportBackup, serializeBackup } from "@/lib/db/backup";
import { BackupError, importBackup, parseBackup } from "@/lib/db/backup-import";
import { notesRepo, projectsRepo } from "@/lib/db/repos";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seedAndExport(): Promise<string> {
  const p = await projectsRepo.create({ name: "Game" });
  await notesRepo.create({ projectId: p.id, title: "Idea", body: "Dash" });
  await db.attachments.add({ id: "a", projectId: p.id, name: "n.txt", mimeType: "text/plain", size: 5, blob: new Blob(["hello"], { type: "text/plain" }), createdAt: 1 });
  return serializeBackup(await exportBackup(db, "0.2.0.0"));
}

describe("parseBackup", () => {
  it.each([
    ["not json", "{", "not-json"],
    ["wrong format", JSON.stringify({ format: "other", version: 1, tables: {} }), "wrong-format"],
    ["future file version", JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, dexieVersion: 1, tables: {} }), "too-new"],
    ["future schema", JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, dexieVersion: 9999, tables: {} }), "too-new"],
    ["unknown table", JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, dexieVersion: 10, tables: { bogus: [] } }), "unknown-table"],
  ])("rejects %s", (_n, text, code) => {
    try {
      parseBackup(text, db);
      throw new Error("expected BackupError");
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError);
      expect((e as BackupError).code).toBe(code);
    }
  });
  it("accepts a real export", async () => {
    expect(parseBackup(await seedAndExport(), db).format).toBe(BACKUP_FORMAT);
  });
});

describe("importBackup", () => {
  it("replace: restores exactly the exported state, blobs included", async () => {
    const text = await seedAndExport();
    await Promise.all(db.tables.map((t) => t.clear()));
    await projectsRepo.create({ name: "Junk that must disappear" });
    const summary = await importBackup(db, parseBackup(text, db), "replace");
    expect(summary.tables.projects).toBe(1);
    expect((await db.projects.toArray()).map((p) => p.name)).toEqual(["Game"]);
    const att = await db.attachments.get("a");
    expect(await att!.blob.text()).toBe("hello");
  });
  it("merge: adds missing rows and never overwrites or duplicates existing ones", async () => {
    const text = await seedAndExport();
    const existing = (await db.notes.toArray())[0];
    await db.notes.update(existing.id, { title: "Edited locally" });
    const summary = await importBackup(db, parseBackup(text, db), "merge");
    expect(summary.tables.notes).toBe(0);
    expect((await db.notes.get(existing.id))!.title).toBe("Edited locally");
    await db.notes.clear();
    const again = await importBackup(db, parseBackup(text, db), "merge");
    expect(again.tables.notes).toBe(1);
    expect(await db.notes.count()).toBe(1);
  });
  it("replace also clears the rebuildable index so it is re-created", async () => {
    const text = await seedAndExport();
    await db.embeddings.add({ id: "e", projectId: "p", kind: "note", entityId: "n", chunkIndex: 0, title: "", text: "", hash: "", vector: new Float32Array(1) });
    await importBackup(db, parseBackup(text, db), "replace");
    expect(await db.embeddings.count()).toBe(0);
  });
  it("is atomic: a failing row leaves the previous data intact", async () => {
    await projectsRepo.create({ name: "Keep me" });
    const bad = { format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion: "x", dexieVersion: db.verno, exportedAt: 1, tables: { projects: [{ id: "dup" }, { id: "dup" }] } };
    await expect(importBackup(db, parseBackup(JSON.stringify(bad), db), "replace")).rejects.toBeTruthy();
    expect((await db.projects.toArray()).map((p) => p.name)).toEqual(["Keep me"]);
  });
});
```
Run → FAIL. **Create `src/lib/db/backup-import.ts`:**

```ts
import type { MasarFlowDB } from "@/lib/db";
import { BACKUP_FORMAT, BACKUP_VERSION, decodeValue, type BackupFile } from "./backup";

export type BackupErrorCode = "not-json" | "wrong-format" | "too-new" | "unknown-table";

export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

/** Validate a backup file's text against this database. Throws BackupError. */
export function parseBackup(text: string, db: MasarFlowDB): BackupFile {
  let data: Partial<BackupFile>;
  try {
    data = JSON.parse(text) as Partial<BackupFile>;
  } catch {
    throw new BackupError("not-json", "This file is not a MasarFlow backup (it is not valid JSON).");
  }
  if (data.format !== BACKUP_FORMAT || typeof data.tables !== "object" || data.tables === null) {
    throw new BackupError("wrong-format", "This file is not a MasarFlow backup.");
  }
  if ((data.version ?? 0) > BACKUP_VERSION || (data.dexieVersion ?? 0) > db.verno) {
    throw new BackupError("too-new", "This backup was created by a newer version of MasarFlow. Update the application and try again.");
  }
  const known = new Set(db.tables.map((t) => t.name));
  for (const name of Object.keys(data.tables)) {
    if (!known.has(name)) throw new BackupError("unknown-table", `The backup contains an unknown table: ${name}.`);
  }
  return data as BackupFile;
}

export interface ImportSummary {
  tables: Record<string, number>;
}

/** Atomic: either everything lands or nothing changes. */
export async function importBackup(db: MasarFlowDB, file: BackupFile, mode: "replace" | "merge"): Promise<ImportSummary> {
  const summary: ImportSummary = { tables: {} };
  await db.transaction("rw", db.tables, async () => {
    if (mode === "replace") await Promise.all(db.tables.map((t) => t.clear()));
    for (const table of db.tables) {
      const rows = file.tables[table.name];
      if (!rows) continue;
      const decoded = rows.map(decodeValue);
      if (mode === "replace") {
        await table.bulkAdd(decoded);
        summary.tables[table.name] = decoded.length;
      } else {
        const have = new Set(await table.toCollection().primaryKeys());
        const fresh = decoded.filter((r) => !have.has((r as { id: string }).id));
        if (fresh.length) await table.bulkAdd(fresh);
        summary.tables[table.name] = fresh.length;
      }
    }
  });
  return summary;
}
```
Run → PASS. Commit: `feat(data): validated, atomic backup import (replace and merge)`.

## P4.T3 — Export / Import UI in Settings (≈8 min)

This card is deliberately **free of desktop imports** so it can be cherry-picked onto `main` for the v0.1.6 bridge (P4.T8).

**Create `src/components/settings/data-backup-card.tsx`:**

```tsx
"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { exportBackup, serializeBackup } from "@/lib/db/backup";
import { BackupError, importBackup, parseBackup } from "@/lib/db/backup-import";
import { Button } from "@/components/ui/button";

const APP_VERSION = "0.2.0.0";

type Pending = { text: string; summary: string };

export function DataBackupCard() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function doExport() {
    setBusy(true);
    setMessage(null);
    try {
      const file = await exportBackup(db, APP_VERSION);
      const blob = new Blob([serializeBackup(file)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `masarflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const rows = Object.values(file.tables).reduce((n, t) => n + t.length, 0);
      setMessage({ kind: "ok", text: `Backup exported (${rows} records). API keys are not included.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "The backup could not be created." });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = parseBackup(text, db);
      const rows = Object.values(parsed.tables).reduce((n, t) => n + t.length, 0);
      setPending({ text, summary: `${file.name}: ${rows} records, created ${new Date(parsed.exportedAt).toLocaleString()}.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof BackupError ? e.message : "The file could not be read." });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function confirm(mode: "replace" | "merge") {
    if (!pending) return;
    setBusy(true);
    try {
      const summary = await importBackup(db, parseBackup(pending.text, db), mode);
      const total = Object.values(summary.tables).reduce((a, b) => a + b, 0);
      setMessage({ kind: "ok", text: mode === "replace" ? `Workspace restored (${total} records).` : `${total} new records merged.` });
      setPending(null);
    } catch (e) {
      setMessage({ kind: "error", text: `Import failed and nothing was changed. ${e instanceof Error ? e.message : ""}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="backup-title">
      <h3 id="backup-title" className="text-sm font-semibold">Backup and restore</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Export your entire workspace to one file, or restore from one. API keys and the semantic index are not included.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={doExport} disabled={busy}>
          <Download className="mr-2 size-3.5" /> Export backup
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Upload className="mr-2 size-3.5" /> Import backup…
        </Button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {pending ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs" role="alertdialog" aria-label="Confirm import">
          <p>{pending.summary}</p>
          <p className="mt-1 text-muted-foreground">
            <strong>Replace</strong> deletes everything in this workspace first. <strong>Merge</strong> only adds records that are missing.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => void confirm("replace")} disabled={busy}>Replace workspace</Button>
            <Button size="sm" variant="outline" onClick={() => void confirm("merge")} disabled={busy}>Merge missing records</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className={`mt-2 text-xs ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
```
Verify `Button` variants (`destructive`, `ghost`) exist in `src/components/ui/button.tsx`; if not, use the closest existing variant. **Mount** `<DataBackupCard />` in `src/components/settings/settings-view.tsx` directly above the existing "Reset all data" control (anchor: `grep -n "resetData" src/components/settings/settings-view.tsx`).

**E2E:** add `tests/e2e/backup.spec.ts` with title `/settings: export then import restores the workspace` — create a project via the smoke helper, open `/settings`, click **Export backup** (`page.waitForEvent("download")`, save to a temp file), click the existing reset control and confirm, assert the first-run dialog appears, then in `/settings` choose the downloaded file in the hidden input (`setInputFiles`), click **Replace workspace**, assert the project name is back. Add the title to `feature-matrix.json` under `/settings`.

Run `pnpm lint && pnpm typecheck && pnpm build && pnpm e2e -- backup.spec.ts` → `1 passed`. Commit: `feat(data): backup and restore card in Settings`.

## P4.T4 — Change tracking + retention policy + disk backups (TDD for pure parts, ≈12 min)

**Failing test `tests/unit/lib/db/dirty.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { installDirtyTracking, takeDirty } from "@/lib/db/dirty";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  takeDirty();
});

describe("dirty tracking", () => {
  it("counts creates, updates and deletes on user-data tables", async () => {
    const off = installDirtyTracking(db);
    await db.notes.add({ id: "n", projectId: "p", title: "t", body: "", type: "note", tags: [], folderId: null, createdAt: 1, updatedAt: 1 } as never);
    await db.notes.update("n", { title: "u" });
    await db.notes.delete("n");
    expect(takeDirty()).toBe(3);
    expect(takeDirty()).toBe(0);
    off();
  });
  it("ignores noisy / rebuildable tables and stops after unsubscribe", async () => {
    const off = installDirtyTracking(db);
    await db.embeddings.add({ id: "e", projectId: "p", kind: "k", entityId: "x", chunkIndex: 0, title: "", text: "", hash: "", vector: new Float32Array(1) });
    await db.watchEvents.add({ id: "w", projectId: "p", path: "a", kind: "modified", fileType: "other", createdAt: 1 } as never);
    expect(takeDirty()).toBe(0);
    off();
    await db.notes.add({ id: "n2", projectId: "p", title: "t", body: "", type: "note", tags: [], folderId: null, createdAt: 1, updatedAt: 1 } as never);
    expect(takeDirty()).toBe(0);
  });
});
```
Run → FAIL. **Create `src/lib/db/dirty.ts`:**

```ts
import type { MasarFlowDB } from "@/lib/db";

/** Tables whose churn must not trigger a backup. */
const IGNORED = new Set(["embeddings", "watchEvents", "parsedContents"]);

let dirty = 0;

/** Returns and resets the number of user-data writes since the last call. */
export function takeDirty(): number {
  const n = dirty;
  dirty = 0;
  return n;
}

/** Subscribe to Dexie table hooks. (P5's activity log is a separate subscriber: src/lib/activity/track.ts.) */
export function installDirtyTracking(db: MasarFlowDB): () => void {
  const bump = (): void => {
    dirty++;
  };
  const offs: Array<() => void> = [];
  for (const table of db.tables) {
    if (IGNORED.has(table.name)) continue;
    table.hook("creating", bump);
    table.hook("updating", bump);
    table.hook("deleting", bump);
    offs.push(() => {
      table.hook("creating").unsubscribe(bump);
      table.hook("updating").unsubscribe(bump);
      table.hook("deleting").unsubscribe(bump);
    });
  }
  return () => offs.forEach((f) => f());
}
```
Run → PASS. (Dexie's `hook(name, fn)` returns void when subscribing; `hook(name)` without fn returns the event whose `.unsubscribe(fn)` removes it — if the typings disagree, `pnpm typecheck` shows the exact signature; adjust.)

**Failing test `tests/unit/desktop/backup-retention.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { backupFileName, isBackupFileName, planRetention } from "@desktop/backups";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 16, 12, 0, 0);
const f = (hoursAgo: number) => ({
  name: backupFileName(new Date(now - hoursAgo * 3_600_000)),
  mtimeMs: now - hoursAgo * 3_600_000,
});

describe("backup file names", () => {
  it("round-trips and rejects foreign names", () => {
    const n = backupFileName(new Date(Date.UTC(2026, 9, 16, 8, 5, 3)));
    expect(n).toBe("masarflow-20261016-080503.json.gz");
    expect(isBackupFileName(n)).toBe(true);
    for (const bad of ["x.json", "../masarflow-20261016-080503.json.gz", "masarflow-1.json.gz"]) expect(isBackupFileName(bad)).toBe(false);
  });
});

describe("planRetention", () => {
  it("keeps everything while there are few files", () => {
    expect(planRetention([f(1), f(2), f(3)], now)).toEqual([]);
  });
  it("keeps the 5 newest, the newest per day for 7 days and the newest per week for 4 weeks", () => {
    const files = Array.from({ length: 60 }, (_, i) => f(i * 6)); // a backup every 6 hours for 15 days
    const doomed = new Set(planRetention(files, now));
    const kept = files.filter((x) => !doomed.has(x.name));
    expect(kept.length).toBeLessThan(files.length);
    expect(kept.length).toBeGreaterThanOrEqual(11);
    for (const newest of files.slice(0, 5)) expect(doomed.has(newest.name)).toBe(false);
    // every calendar day that has a file younger than 7 days keeps at least one
    const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    const young = (x: { mtimeMs: number }): boolean => now - x.mtimeMs < 7 * DAY;
    const daysIn = new Set(files.filter(young).map((x) => dayOf(x.mtimeMs)));
    const daysKept = new Set(kept.filter(young).map((x) => dayOf(x.mtimeMs)));
    expect(daysKept).toEqual(daysIn);
  });
  it("deletes files older than 4 weeks unless they are among the newest 5", () => {
    const old = [f(24 * 40), f(24 * 41)];
    const doomed = planRetention([f(1), f(2), f(3), f(4), f(5), ...old], now);
    expect(doomed.sort()).toEqual(old.map((o) => o.name).sort());
  });
});
```
Run → FAIL. **Create `desktop/src/main/backups.ts`:**

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const NAME_RE = /^masarflow-\d{8}-\d{6}\.json\.gz$/;
const DAY = 86_400_000;

export const isBackupFileName = (name: string): boolean => NAME_RE.test(name);

export function backupFileName(d: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `masarflow-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.json.gz`;
}

export interface BackupInfo {
  name: string;
  mtimeMs: number;
}

const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const weekKey = (ms: number): string => String(Math.floor(ms / (7 * DAY)));

/** Names to delete: keep newest 5, newest per day (7 days), newest per week (4 weeks). */
export function planRetention(files: BackupInfo[], now: number): string[] {
  const sorted = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const keep = new Set(sorted.slice(0, 5).map((f) => f.name));
  const days = new Set<string>();
  const weeks = new Set<string>();
  for (const f of sorted) {
    const age = now - f.mtimeMs;
    if (age < 7 * DAY && !days.has(dayKey(f.mtimeMs))) {
      days.add(dayKey(f.mtimeMs));
      keep.add(f.name);
    }
    if (age < 28 * DAY && !weeks.has(weekKey(f.mtimeMs))) {
      weeks.add(weekKey(f.mtimeMs));
      keep.add(f.name);
    }
  }
  return sorted.filter((f) => !keep.has(f.name)).map((f) => f.name);
}

export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(isBackupFileName)
    .map((name) => ({ name, mtimeMs: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function writeBackup(dir: string, json: string, now = new Date()): BackupInfo {
  mkdirSync(dir, { recursive: true });
  const name = backupFileName(now);
  writeFileSync(join(dir, name), gzipSync(Buffer.from(json, "utf8")));
  for (const old of planRetention(listBackups(dir), now.getTime())) unlinkSync(join(dir, old));
  return { name, mtimeMs: now.getTime() };
}

export function readBackup(dir: string, name: string): string {
  if (!isBackupFileName(name)) throw new Error("Invalid backup name");
  return gunzipSync(readFileSync(join(dir, name))).toString("utf8");
}
```
Run → PASS. (Worked example for the 60-file case, `now` = 2026-10-16T12:00Z: the 5 newest, plus the newest file of each of the 8 UTC days Oct 9–16 that have a file younger than 7 days, plus one weekly survivor from the Oct 1–7 epoch week = 12 kept; the assertion is `>= 11` to leave one file of slack. Do not weaken any other assertion.)

**Wire IPC (shared files):** channels `backupsWrite: "backups:write"`, `backupsList: "backups:list"`, `backupsRead: "backups:read"`, `backupsOpenFolder: "backups:open-folder"`; API `backups: { write(json: string): Promise<{name:string;mtimeMs:number}>; list(): Promise<Array<{name:string;mtimeMs:number}>>; read(name: string): Promise<string>; openFolder(): Promise<void>; }`; preload + `ipc/index.ts` handlers using `join(app.getPath("userData"), "backups")`; `write` must verify `typeof json === "string" && json.length < 512 * 1024 * 1024`.

**Renderer scheduler — failing test `tests/unit/lib/db/auto-backup.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { shouldBackup } from "@/lib/db/auto-backup";

const H = 3_600_000;
describe("shouldBackup", () => {
  const now = 1_000 * H;
  it("backs up immediately when none exists and the workspace has data", () => {
    expect(shouldBackup({ now, lastBackupAt: null, dirty: 0, hasData: true })).toBe(true);
    expect(shouldBackup({ now, lastBackupAt: null, dirty: 0, hasData: false })).toBe(false);
  });
  it("on boot, refreshes a stale backup only if something changed", () => {
    expect(shouldBackup({ now, lastBackupAt: now - 21 * H, dirty: 1, hasData: true })).toBe(true);
    expect(shouldBackup({ now, lastBackupAt: now - 21 * H, dirty: 0, hasData: true })).toBe(false);
  });
  it("while running, waits two hours between backups", () => {
    expect(shouldBackup({ now, lastBackupAt: now - 1 * H, dirty: 50, hasData: true })).toBe(false);
    expect(shouldBackup({ now, lastBackupAt: now - 3 * H, dirty: 1, hasData: true })).toBe(true);
  });
});
```
Run → FAIL. **Create `src/lib/db/auto-backup.ts`:**

```ts
import { db } from "@/lib/db";
import { exportBackup, serializeBackup } from "@/lib/db/backup";
import { installDirtyTracking, takeDirty } from "@/lib/db/dirty";
import { getDesktop } from "@/lib/desktop/bridge";

const H = 3_600_000;
const APP_VERSION = "0.2.0.0";

export interface BackupDecisionInput {
  now: number;
  lastBackupAt: number | null;
  dirty: number;
  hasData: boolean;
}

/** Pure scheduling rule: minimum 2 h between backups, and only when something changed. */
export function shouldBackup(i: BackupDecisionInput): boolean {
  if (!i.hasData) return false;
  if (i.lastBackupAt === null) return true;
  return i.dirty > 0 && i.now - i.lastBackupAt >= 2 * H;
}

let carriedDirty = 0;

async function hasAnyData(): Promise<boolean> {
  return (await db.projects.count()) > 0;
}

/** Write a backup now (desktop only). Returns the file name, or null when unavailable. */
export async function backupNow(): Promise<string | null> {
  const d = getDesktop();
  if (!d) return null;
  const json = serializeBackup(await exportBackup(db, APP_VERSION));
  return (await d.backups.write(json)).name;
}

/** Start silent rolling backups. Returns a stop function. */
export function startAutoBackup(): () => void {
  const d = getDesktop();
  if (!d) return () => {};
  const off = installDirtyTracking(db);
  const tick = async (): Promise<void> => {
    try {
      carriedDirty += takeDirty();
      const list = await d.backups.list();
      const last = list[0]?.mtimeMs ?? null;
      if (shouldBackup({ now: Date.now(), lastBackupAt: last, dirty: carriedDirty, hasData: await hasAnyData() })) {
        await backupNow();
        carriedDirty = 0;
      }
    } catch (e) {
      console.warn("[auto-backup] failed", e);
    }
  };
  const first = setTimeout(() => void tick(), 20_000);
  const timer = setInterval(() => void tick(), 30 * 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
    off();
  };
}
```
Run → PASS. **Mount:** create `src/components/shell/auto-backup.tsx` (`"use client"` component: `useEffect(() => startAutoBackup(), [])`, returns null) and render `<AutoBackup />` next to `<SecretsBootstrap />` in the workspace layout.

`pnpm desktop:typecheck && pnpm typecheck && pnpm lint && pnpm test` → green. Commit: `feat(data): silent rolling disk backups with retention (desktop)`.

## P4.T5 — Automatic-backups list & restore UI (≈6 min)

**Create `src/components/settings/auto-backups-card.tsx`** (desktop-only; renders `null` in a browser):

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { db } from "@/lib/db";
import { parseBackup, importBackup } from "@/lib/db/backup-import";
import { backupNow } from "@/lib/db/auto-backup";
import { getDesktop } from "@/lib/desktop/bridge";
import { useMounted } from "@/lib/hooks/use-mounted";
import { Button } from "@/components/ui/button";

interface Item {
  name: string;
  mtimeMs: number;
}

export function AutoBackupsCard() {
  const mounted = useMounted();
  const desktop = mounted ? getDesktop() : null;
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (desktop) setItems(await desktop.backups.list());
  }, [desktop]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async load
    void refresh();
  }, [refresh]);

  if (!desktop) return null;

  async function restore(name: string) {
    if (!window.confirm(`Replace the current workspace with the backup from ${name}?`)) return;
    setBusy(true);
    try {
      const text = await desktop!.backups.read(name);
      await importBackup(db, parseBackup(text, db), "replace");
      setMessage("Workspace restored.");
    } catch (e) {
      setMessage(`Restore failed and nothing was changed. ${e instanceof Error ? e.message : ""}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="auto-backups-title">
      <div className="flex items-center justify-between">
        <h3 id="auto-backups-title" className="text-sm font-semibold">Automatic backups</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); await backupNow(); await refresh(); setBusy(false); }}>
            Back up now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void desktop.backups.openFolder()}>
            <FolderOpen className="mr-2 size-3.5" /> Open folder
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        MasarFlow keeps recent copies of your workspace on this computer. The newest five, one per day for a week and one per week for a month are retained.
      </p>
      <ul className="mt-3 divide-y divide-border text-xs">
        {items.length === 0 ? <li className="py-2 text-muted-foreground">No backups yet.</li> : null}
        {items.map((b) => (
          <li key={b.name} className="flex items-center justify-between py-2">
            <span>{new Date(b.mtimeMs).toLocaleString()}</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void restore(b.name)}>Restore</Button>
          </li>
        ))}
      </ul>
      {message ? <p className="mt-2 text-xs text-muted-foreground" role="status">{message}</p> : null}
    </section>
  );
}
```
Mount under `<DataBackupCard />` in settings. Safety backup before destructive reset: in the settings handler that calls `resetData()` (anchor: `grep -n "resetData" src/components/settings/settings-view.tsx`) insert `await backupNow().catch(() => null);` immediately before it and change the confirm text to mention `A backup is saved first.` (desktop only; harmless no-op in a browser).

**Manual proof (record in commit body):** in the packaged app create a project → wait 20 s → `ls "$APPDATA/MasarFlow/backups"` shows one `masarflow-*.json.gz` → Settings shows it → reset all data → restore it → project returns.

`pnpm lint && pnpm typecheck` → green. Commit: `feat(data): automatic backups list, manual backup and restore`.

## P4.T6 — Database health check and recovery screen (TDD for classification, ≈8 min)

**Failing test `tests/unit/lib/db/health.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { classifyDbError } from "@/lib/db/health";

const err = (name: string, message = "") => Object.assign(new Error(message), { name });

describe("classifyDbError", () => {
  it.each([
    ["VersionError", "version"],
    ["QuotaExceededError", "quota"],
    ["DatabaseClosedError", "closed"],
    ["OpenFailedError", "unreadable"],
    ["UnknownError", "unreadable"],
    ["SomethingElse", "unknown"],
  ])("%s → %s", (name, kind) => {
    expect(classifyDbError(err(name)).kind).toBe(kind);
  });
  it("gives plain-language, formal messages and never leaks stack traces", () => {
    const c = classifyDbError(err("QuotaExceededError"));
    expect(c.message).toMatch(/storage/i);
    expect(c.message).not.toMatch(/at |\.ts:/);
  });
  it("treats non-Error values as unknown", () => {
    expect(classifyDbError("boom").kind).toBe("unknown");
  });
});
```
Run → FAIL. **Create `src/lib/db/health.ts`:**

```ts
import type { MasarFlowDB } from "@/lib/db";

export type DbErrorKind = "version" | "quota" | "closed" | "unreadable" | "unknown";

export interface DbProblem {
  kind: DbErrorKind;
  message: string;
}

export function classifyDbError(e: unknown): DbProblem {
  const name = e instanceof Error ? e.name : "";
  switch (name) {
    case "VersionError":
      return { kind: "version", message: "The workspace was saved by a newer version of MasarFlow. Update the application to open it." };
    case "QuotaExceededError":
      return { kind: "quota", message: "The computer has no free storage left for the workspace. Free some disk space and try again." };
    case "DatabaseClosedError":
      return { kind: "closed", message: "The workspace database was closed unexpectedly. Retry to open it again." };
    case "OpenFailedError":
    case "UnknownError":
      return { kind: "unreadable", message: "The workspace database could not be opened. It may be damaged." };
    default:
      return { kind: "unknown", message: "The workspace database reported an unexpected problem." };
  }
}

/** Resolves null when the database opens, otherwise a classified problem. */
export async function checkDb(db: MasarFlowDB): Promise<DbProblem | null> {
  try {
    if (!db.isOpen()) await db.open();
    await db.projects.count();
    return null;
  } catch (e) {
    return classifyDbError(e);
  }
}
```
Run → PASS.

**Create `src/components/shell/db-gate.tsx`:**

```tsx
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { checkDb, type DbProblem } from "@/lib/db/health";
import { parseBackup, importBackup } from "@/lib/db/backup-import";
import { resetData } from "@/lib/db/data";
import { getDesktop } from "@/lib/desktop/bridge";
import { Button } from "@/components/ui/button";

/** Renders children once the database is readable; otherwise a recovery screen. */
export function DbGate({ children }: { children: ReactNode }) {
  const [problem, setProblem] = useState<DbProblem | null>(null);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = useCallback(async () => {
    setProblem(await checkDb(db));
    setChecked(true);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time startup probe
    void run();
  }, [run]);

  if (!checked) return null;
  if (!problem) return <>{children}</>;

  const desktop = getDesktop();
  async function restoreLatest() {
    try {
      const [latest] = (await desktop!.backups.list());
      if (!latest) return setNote("There is no automatic backup to restore.");
      await importBackup(db, parseBackup(await desktop!.backups.read(latest.name), db), "replace");
      await run();
    } catch (e) {
      setNote(`Restore failed. ${e instanceof Error ? e.message : ""}`);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8" role="alert">
        <AlertTriangle className="mb-4 size-8 text-warning" />
        <h1 className="text-base font-semibold">Your workspace could not be opened</h1>
        <p className="mt-2 text-sm text-muted-foreground">{problem.message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void run()}>Try again</Button>
          {desktop ? <Button variant="outline" onClick={() => void restoreLatest()}>Restore the latest automatic backup</Button> : null}
          {desktop ? <Button variant="ghost" onClick={() => void desktop.backups.openFolder()}>Open backups folder</Button> : null}
          <Button
            variant="destructive"
            onClick={async () => {
              if (window.confirm("This permanently deletes the local workspace. Continue?")) {
                await resetData().catch(() => undefined);
                await run();
              }
            }}
          >
            Reset the workspace
          </Button>
        </div>
        {note ? <p className="mt-3 text-xs text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}
```
Wrap the layout's returned tree in `<DbGate>…</DbGate>` (the outermost element of `WorkspaceLayout`'s JSX; hooks above stay unconditional, so keep the wrapper in the `return`). Manual proof: in DevTools-less packaged build use the e2e (browser mode): `tests/e2e/db-recovery.spec.ts`, title `/dashboard: a corrupt database shows the recovery screen` — before navigation call `page.addInitScript(() => { const open = indexedDB.open.bind(indexedDB); indexedDB.open = (name, v) => name === "masarflow" ? open(name, 1) : open(name, v); })` which forces a `VersionError` after a normal first visit (visit once to create v11, reload with the script installed), then assert the alert with text `could not be opened` is visible and **Try again** is present. Add to the feature matrix under `/dashboard`.

Run `pnpm test && pnpm lint && pnpm typecheck && pnpm build && pnpm e2e -- db-recovery.spec.ts` → green. Commit: `feat(data): database health gate with recovery screen`.

## P4.T7 — Legacy bridge: v0.1.6 export release for existing users (optional but recommended; ≈10 min)

**Why:** v0.1 users hold their data in a browser profile at `http://localhost:3000`, a different origin from `masarflow://app`. They can only move it with a file. v0.1.x has no export, so ship one first. **Needs Q10 = yes** (default yes).

```bash
git log --oneline release/v0.2.0 -- src/lib/db/backup.ts src/lib/db/backup-import.ts src/components/settings/data-backup-card.tsx
git switch main && git switch -c release/v0.1.6
git cherry-pick <backup.ts commit> <backup-import.ts commit> <data-backup-card commit>
```
Resolve conflicts: on `main` there is no `embeddings` table (the `EXCLUDED_TABLES` entry is harmless), no `@/lib/desktop/bridge` (the card does not use it), and the settings mount must be re-applied by hand above the "Reset all data" control. Copy `tests/unit/lib/db/backup-*.test.ts` (drop the two `embeddings` assertions). Set `package.json` version to `0.1.6.0` and `APP_VERSION` in the card accordingly.

```bash
pnpm test && pnpm typecheck && pnpm lint
git switch release/v0.2.0
```
Expected on `main`: all green. Importing a v0.1.6 export into 0.2: add a fixture test `tests/unit/lib/db/backup-v010-fixture.test.ts` on `release/v0.2.0` that parses `tests/fixtures/backup-v10.json` (generate by running the cherry-picked export on a seeded v10 database and trimming to ~5 rows per table) and asserts `importBackup(…, "replace")` restores the project and notes — this pins the cross-version contract.

Commit (on `release/v0.1.6`): `feat(data): backup export for the v0.2 migration`; (on `release/v0.2.0`): `test(data): v0.1.6 export fixture imports into v0.2`.

## P4 gate

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm desktop:typecheck
pnpm build && pnpm e2e                       # smoke + semantic-index + backup + db-recovery all pass
pnpm desktop:dist:dir && pnpm smoke:desktop  # SMOKE_OK
```
Expected: every command exits 0; `pnpm e2e` ends with `N passed` and `0 failed`.

---

## Self-review checklist for P1b–P4 (the executor ticks these before moving on)

- [ ] Every `desktop/src/main/**` module with logic is covered by a test in `tests/unit/desktop/` (the IPC glue and `index.ts` are covered by `smoke:desktop`).
- [ ] `pnpm security:check` prints `SECURITY_CHECK_OK 12/12` against the **packaged** server.
- [ ] `pnpm smoke:desktop` prints `SMOKE_OK` including `"guard":{"status":403,…}` (P2.T10) — the renderer's real headers pass the guard.
- [ ] No `grep -rn "api/python" src` hits; `python-service/` is untouched (kept for one release, Q1).
- [ ] Opening the app with no network and no Python reaches Ready for the semantic index.
- [ ] `ls %APPDATA%\MasarFlow` shows `secrets.json` containing no plaintext (open it and look), and `localStorage` of the renderer has no `pat`/`apiKey` (checked via the P9 e2e).
- [ ] Backups exist after 20 s on a fresh profile and restoring one returns the workspace.
