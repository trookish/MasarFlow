# Phase 1 — Security: close every verified hole

**Goal:** no API route is reachable cross-origin or through DNS rebinding in any mode; filesystem roots fail closed; the embed proxy cannot reach private networks; third-party frames are sandboxed; secrets never ride in URLs; CSP lists real hosts.
**Branch:** `overhaul/v0.3`. **Depends on:** P0 T2 (CI runs `security:check`).
**Master:** `.hermes/plans/2026-10-25_235321-masarflow-overhaul-v0-3-master.md` (§2 rows S1–S6, D10).

## Verified context (read 2026-10-25)

| Fact | Evidence |
|---|---|
| `guardConfigFromEnv` returns `null` without `MASARFLOW_TOKEN`; `proxy` then returns `NextResponse.next()` | `src/lib/server/request-guard.ts:50-52`, `src/proxy.ts:10-11` |
| `checkRequest(cfg, r)` checks host, token, then origin (non-GET needs origin) | `request-guard.ts:35-47` |
| `assertRootAllowed` returns early when `MASARFLOW_DATA_DIR` unset | `src/lib/server/roots.ts:25-26` |
| fs routes are pinned by `tests/unit/api/fs-routes-guarded.test.ts` (list/read/search/shell/write + watch) | read |
| Embed: `fetchText` follows redirects recursively with no host check (`:47-56`), `rejectUnauthorized: false` (`:44`); GET checks a hostname prefix list only (`:170-181`) | `src/app/api/canvas/embed/route.ts` |
| Video branch renders `<iframe src={data.url}>` with no `sandbox` | `src/components/canvas/nodes/web-node.tsx:189-194` |
| CSP `connect-src` / `img-src` / `frame-src` include `https:`; `TODO(P9.T6)` | `desktop/src/main/security/csp.ts:3-15` |
| Existing proxy test asserts pass-through without a token — **this test changes intentionally in T1** | `tests/unit/proxy.test.ts:15-18` |

## Design (D10 refined)

Dev/browser mode has no Electron to mint a token, so it cannot use the token check. It **can** enforce Host (anti-DNS-rebinding) and Origin (anti-CSRF): browsers always send `Origin` on cross-origin requests and on every POST. Dev guard = Host ∈ `{localhost:PORT, 127.0.0.1:PORT}` and, for every request under `/api/`, Origin absent-and-GET or Origin ∈ `{http://localhost:PORT, http://127.0.0.1:PORT}`; plus `Sec-Fetch-Site: cross-site` → deny. A local non-browser process can still forge headers; that attacker already runs code as the user (documented in `SECURITY.md`).

## File map

New: `src/lib/server/net-policy.ts` (T3), `tests/unit/lib/server/net-policy.test.ts` (T3), `src/lib/server/allowed-hosts.ts` (T6), `tests/unit/lib/server/allowed-hosts.test.ts` (T6).
Modified: `src/lib/server/request-guard.ts` (T1), `src/proxy.ts` (T1), `tests/unit/proxy.test.ts` (T1), `tests/unit/lib/server/request-guard.test.ts` (T1), `src/lib/server/roots.ts` (T2), `tests/unit/lib/server/roots.test.ts` (T2), `src/app/api/canvas/embed/route.ts` (T3), `src/components/canvas/nodes/web-node.tsx` (T4), `src/app/api/obsidian/media/route.ts` + `src/components/brain/markdown-preview.tsx` (T5), `desktop/src/main/security/csp.ts` + `tests/unit/desktop/csp.test.ts` (T6), `scripts/security-check.mjs` (T7), `SECURITY.md` (T7).

## Tasks

### T1 — Guard dev mode

Failing tests first. Append to `tests/unit/lib/server/request-guard.test.ts`:

```ts
import { checkDevRequest } from "@/lib/server/request-guard";

describe("checkDevRequest", () => {
  const dev = { port: "3000" };
  const r = (o: Partial<GuardRequest & { fetchSite: string | null }> = {}) => ({
    method: "GET", pathname: "/api/fs/list", host: "localhost:3000", origin: null, token: null, fetchSite: null, ...o,
  });
  it("accepts same-origin API calls", () => {
    expect(checkDevRequest(dev, r({ method: "POST", origin: "http://localhost:3000" }))).toEqual({ ok: true });
  });
  it("rejects a rebinding host", () => {
    expect(checkDevRequest(dev, r({ host: "evil.test:3000" }))).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects a cross-origin POST", () => {
    expect(checkDevRequest(dev, r({ method: "POST", origin: "https://evil.test" }))).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects an origin-less POST", () => {
    expect(checkDevRequest(dev, r({ method: "POST" }))).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects cross-site fetch metadata even on GET", () => {
    expect(checkDevRequest(dev, r({ fetchSite: "cross-site" }))).toMatchObject({ ok: false, status: 403 });
  });
  it("does not guard non-API pages beyond the host check", () => {
    expect(checkDevRequest(dev, r({ pathname: "/today", fetchSite: "cross-site" }))).toEqual({ ok: true });
  });
});
```

Run `pnpm vitest run tests/unit/lib/server/request-guard.test.ts` → fails: `checkDevRequest is not a function` (6 new failures).

Implementation, append to `request-guard.ts`:

```ts
export function checkDevRequest(
  cfg: { port: string },
  r: GuardRequest & { fetchSite: string | null },
): GuardResult {
  const hosts = [`localhost:${cfg.port}`, `127.0.0.1:${cfg.port}`];
  const host = r.host?.toLowerCase() ?? "";
  if (!hosts.includes(host)) return deny(403, "host not allowed");
  if (!r.pathname.startsWith("/api/")) return { ok: true };
  if (r.fetchSite === "cross-site") return deny(403, "cross-site request");
  const origins = hosts.map((h) => `http://${h}`);
  if (r.origin !== null) {
    if (!origins.includes(r.origin)) return deny(403, "origin not allowed");
  } else if (!READ_ONLY.has(r.method.toUpperCase())) {
    return deny(403, "state-changing requests must carry an allowed origin");
  }
  return { ok: true };
}
```

In `src/proxy.ts` replace `if (!cfg) return NextResponse.next();` with:

```ts
  if (!cfg) {
    const dev = checkDevRequest(
      { port: process.env.PORT?.trim() || "3000" },
      {
        method: request.method,
        pathname: request.nextUrl.pathname,
        host: request.headers.get("host"),
        origin: request.headers.get("origin"),
        token: null,
        fetchSite: request.headers.get("sec-fetch-site"),
      },
    );
    return dev.ok ? NextResponse.next() : NextResponse.json({ error: dev.reason }, { status: dev.status });
  }
```

and update the doc comment. In `tests/unit/proxy.test.ts` replace the pass-through test with two: same-origin POST with `host: localhost:3000, origin: http://localhost:3000` passes (`x-middleware-next: 1`); POST with `origin: https://evil.test` → 403.
Run both files → `PASS`. Run `pnpm dev`, exercise Today, Brain, Chat in a browser: no 403 in the console (fetches from the app carry the same origin). Commit `fix(security): guard API routes in dev mode by host and origin`.

### T2 — Roots fail closed

Tests in `tests/unit/lib/server/roots.test.ts`: (a) no `MASARFLOW_DATA_DIR` and no `MASARFLOW_DEV_ROOTS` → throws `{status: 403}`; (b) `MASARFLOW_DEV_ROOTS="C:/work;D:/x"` and root `C:/work/app` → no throw; (c) same env, root `C:/other` → throws. Run → (a) fails today.
Implementation: when `dataDir` is empty, read `env.MASARFLOW_DEV_ROOTS`, split on `;`, `parseRoots(JSON.stringify(list))` is not needed — pass the trimmed list straight to `isRootAllowed`. Empty list → throw with message `"No folders are linked. Set MASARFLOW_DEV_ROOTS for browser development, or use the desktop app."`. Document `MASARFLOW_DEV_ROOTS` in `docs/development.md`. Commit `fix(security): filesystem roots fail closed outside the desktop app`.

### T3 — SSRF-safe fetch

New `src/lib/server/net-policy.ts`:

```ts
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const V4_BLOCK: Array<[number, number]> = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
  [0xac100000, 12], [0xc0000000, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xe0000000, 4], [0xf0000000, 4],
];
const v4ToInt = (ip: string) => ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;

export function isPublicAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = v4ToInt(ip);
    return !V4_BLOCK.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  if (fam === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPublicAddress(v.slice(7));
    return !(v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff"));
  }
  return false;
}

/** Resolve and require every address to be public. Returns the first address to pin the connection to. */
export async function assertPublicUrl(url: URL): Promise<string> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Blocked: scheme");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || !addrs.every((a) => isPublicAddress(a.address))) throw new Error("Blocked: private address");
  return addrs[0].address;
}
```

Tests (`net-policy.test.ts`, `it.each`): private → false for `127.0.0.1, 10.1.2.3, 172.16.0.1, 192.168.1.1, 169.254.169.254, 0.0.0.0, 100.64.0.1, ::1, fd00::1, fe80::1, ::ffff:127.0.0.1`; public → true for `1.1.1.1, 93.184.216.34, 2606:4700::1111`. 14 cases → `PASS (14 passed)`.
Embed route: delete the hostname prefix block (`:170-181`); in `fetchText` call `await assertPublicUrl(target)` before **every** request including each redirect hop, connect with `lookup: (_h, _o, cb) => cb(null, pinned, isIP(pinned))` so DNS cannot change between check and connect, remove `rejectUnauthorized: false`, cap body at 2 MB. Add a route test that a URL whose redirect points to `http://127.0.0.1/` is rejected (mock `https.request`). Commit `fix(security): embed proxy validates every hop and pins resolved addresses`.

### T4 — Sandbox third-party frames

In `web-node.tsx` both iframes (YouTube branch above `:185` and the video branch `:189-194`) get `sandbox="allow-scripts allow-same-origin allow-presentation"`, `referrerPolicy="no-referrer"`, and `allow="fullscreen; picture-in-picture"`. The video `src` must pass `isEmbeddableVideoUrl(url)` (allow-list: `youtube.com`, `youtube-nocookie.com`, `player.vimeo.com`, `loom.com`) or fall back to the link card. Component test asserts the attribute and the fallback. Commit `fix(security): sandbox canvas frames and allow-list video hosts`.

### T5 — No secrets in URLs

Read `src/app/api/obsidian/media/route.ts` and `getMediaUrl` in `markdown-preview.tsx` first (audit-sourced). Replace the query-string key with: client fetches media via `fetch` with header `x-obsidian-key`, turns the response into a `blob:` URL, revokes on unmount. Route reads the header only; a request carrying a key in the query returns 400. Test both. Commit `fix(security): Obsidian key travels in a header, never in a URL`.

### T6 — Narrow CSP

Verified 2026-10-25: the embedder is fully offline (`src/lib/ai/embeddings/worker.ts:9-14`, `allowRemoteModels = false`, models from `/models/`), and the renderer reaches providers, GitHub and Obsidian through same-origin routes (`/api/chat`, `/api/github`, `/api/obsidian`, `/api/ollama`); `rg 'fetch\(\s*["\x60]https?://' src --glob '!src/app/api/**'` returned no literal external hosts. So the renderer likely needs **no** external `connect-src`. Step 1: confirm by grepping for `new URL(` / `fetch(` with variable URLs in `src/components` and `src/lib` (excluding `src/app/api`) and list each in the commit body. Step 2: `src/lib/server/allowed-hosts.ts` exports `RENDERER_CONNECT_HOSTS` = exactly the hosts that step found (expected: empty). `buildCsp` drops bare `https:` from `connect-src` and `frame-src` (frame → the T4 allow-list); `img-src` keeps `https:` (remote images in markdown are a feature) — record that in a comment and delete the `TODO(P9.T6)`. Update `tests/unit/desktop/csp.test.ts`: `connect-src` contains no bare `https:` token. Commit `fix(security): CSP lists real hosts instead of https:`.

### T7 — Gate and document

Extend `scripts/security-check.mjs` with: dev-mode cross-origin POST to `/api/fs/shell` → 403; `/api/canvas/embed?url=http://169.254.169.254/` → 400; redirect-to-loopback → 400. Update `SECURITY.md` threat model (dev mode, local-process attacker out of scope). Commit `test(security): security check covers dev mode and SSRF`.

## Gate

1. `pnpm vitest run tests/unit/lib/server tests/unit/proxy.test.ts tests/unit/desktop/csp.test.ts tests/unit/api` → PASS.
2. `pnpm test && pnpm lint && pnpm typecheck && pnpm desktop:typecheck` → exit 0.
3. `pnpm build:app && pnpm security:check` → all cases pass including the 3 new ones.
4. `pnpm desktop:dist:dir && pnpm e2e:desktop` → green (proves CSP narrowing broke no provider in the matrix).
5. `rg -n "rejectUnauthorized: false|TODO\(P9.T6\)" src desktop/src` → no matches.

## Risks

- A browser-side fetch missed by the T6 grep is blocked by CSP → packaged e2e (gate 4) plus a `securitypolicyviolation` listener in e2e that fails the spec.
- `Sec-Fetch-Site` missing in older embedded browsers → treated as absent, Origin rule still applies.

## Handoffs

P4: chat/provider requests remain via `/api/chat` (`'self'`); any new browser-side fetch host must be added to `allowed-hosts.ts`.
