# P9 baseline (2026-10-17)

Captured by stream D on branch `release/v0.2.0` at 2026-10-17 09:50 +03, before any P9 task of this stream landed.

| Scan | Command | Result |
|---|---|---|
| plugin ids without a consumer | `node scripts/truth-scan.mjs` | 5: obsidian-sync, github-commits, canvas-ai-assist, canvas-mermaid, canvas-collab |
| api routes without a caller | same | 0 — the four `/api/python/{analyze,parse,git,graph}` proxies were already deleted by P3, so the T2 guard starts with `DEAD_ROUTES = []` |
| pages not in nav | same | 0 |
| settings without a consumer | same | 1: chat.codeHighlighting |
| external tools | `node --version && pnpm --version` | v24.14.0 / 11.21.0 |
| lint | `pnpm lint` | `ESLint: 0 errors, 5 warnings in 3 files` (no-img-element ×4: project-fields.tsx ×3, dashboard-view.tsx ×1; no-unused-expressions ×1: dev-desktop.mjs) |
| test suite | `pnpm test 2>&1 \| tail -8` | `152 files, 1119 tests, all passed, exit 0, 123.34s` |
| packaged build | `ls -la desktop/dist/win-unpacked/MasarFlow.exe` | `desktop/dist/win-unpacked/MasarFlow.exe  215.1M` — present |

Raw scan output (`node scripts/truth-scan.mjs`):

```json
{
  "plugins_without_consumer": [
    "obsidian-sync",
    "github-commits",
    "canvas-ai-assist",
    "canvas-mermaid",
    "canvas-collab"
  ],
  "api_routes_without_caller": [],
  "workspace_pages_not_in_nav": [],
  "settings_without_consumer": [
    "chat.codeHighlighting"
  ]
}
```

## P9.T2 — dead-route guard run

`pnpm exec vitest run --config tests/vitest.config.ts tests/unit/repo-truth/dead-routes.test.ts`

Result: **1 passed** with `const DEAD_ROUTES: string[] = [];`. The plan expected this guard to start red with the four
python proxies; P3 already deleted them, so the allow-list starts and stays empty. Mutation check (temporarily
adding `"/api/nope"` to `DEAD_ROUTES`) fails with `stale: ["/api/nope"]` — the guard bites.

## P9.T6 — packaged-app e2e harness + anchor contract

Anchors landed in `src` (guarded by `tests/unit/repo-truth/anchor-contract.test.ts`): `data-testid="app-shell"`
(layout root), `data-testid="shell-ready"` (dock-workspace root — rendered only while a project is active),
`data-testid="dock-panel"` + `data-dock-url` (dock-group focused-panel container), `data-dock-tab` +
`data-dock-url` (dock-group tab element). The guard also pins `data-dock-url` because the dock specs address a
panel as `[data-testid="dock-panel"][data-dock-url="<id>"]`.

| Step | Command | Result |
|---|---|---|
| guard (before anchors) | `pnpm exec vitest run --config tests/vitest.config.ts tests/unit/repo-truth/anchor-contract.test.ts` | 1 failed — missing: app-shell, shell-ready, dock-panel, data-dock-tab, data-dock-url |
| guard (after anchors) | same | **1 passed** |
| packaged build | `pnpm desktop:dist:dir` | exit 0 (`.next/BUILD_ID` 11:16, `desktop/app-server/server.js` 11:17, `MasarFlow.exe` 11:18) |
| harness proof | `pnpm e2e:desktop tests/e2e/desktop/shell.spec.ts` | **1 passed** (9.0 s) — packaged app, throwaway `--user-data-dir`, wizard onboarding + demo seed via the fixture |

Deviation found by the first run (real repo wins): the packaged shell defaults to `taskbarDirection: "bottom"`,
so nav links live in per-group popups of the floating dock, not in a sidebar rail. The plan's
`getByRole("link", { name: "…" })` locators time out there. The harness therefore ships `navigateTo(page, label)`
(direct link first, then the dock group buttons) and every spec uses it.

## P9.T7 — spec A green + a real bug found

| Step | Command | Result |
|---|---|---|
| desktop e2e | `pnpm e2e:desktop tests/e2e/desktop/shell.spec.ts` | **5 passed** (26.0 s): `/shell` boot, `/dashboard` first-run, `/dashboard` demo data, `/plugins` catalog, restart persistence |
| matrix guard | `pnpm exec vitest run --config tests/vitest.config.ts tests/unit/e2e/feature-matrix.test.ts` | **3 passed** |

Deviations (the real repo wins, per the task file):
1. Plan's `getByRole("link", { name: "Dashboard" | "Plugins" })` cannot work in the packaged shell (bottom floating
   dock — see P9.T6). The first-run spec asserts `shell-ready` + the project name + the `/dashboard` dock tab; the
   plugins spec uses `navigateTo` and asserts the opened dock panel + catalog rows.
2. `/plugins` has no page heading, so the plan's heading assertion was replaced by the panel/catalog assertions.
3. The demo fixture's completion signal was a false positive: "Pulse" matches the `/settings` copy, so the old
   `getByText("Pulse")` returned instantly. The fixture now activates Pulse through the topbar switcher
   (`activateProject`) and the spec asserts the switcher itself.

### BUG (not fixed here — outside this stream's files): "Load demo projects" aborts in the packaged app

`seedDemoProject()` throws `TransactionInactiveError: Transaction has already completed or failed` at Lumen's chat
step. Exact chain, verified against the packaged app:

- `src/lib/db/demo-seed.ts` seeds each demo project inside `db.transaction("rw", db.tables, …)` and calls
  `seedAiConnection()` **inside** that transaction (line ~2223).
- For the second project, `aiConnectionsRepo.list()` returns Pulse's row, so `hydrateConnection()`
  (`src/lib/db/repos/chat-secrets.ts:10`) awaits `getSecret()` → `window.masarflow.secrets.get` — an Electron IPC
  round-trip (`desktop/src/preload/index.ts:43-48`).
- That non-Dexie await ends Dexie's transaction zone; the transaction auto-commits and the next write in it
  (`chatThreadsRepo.create` in `seedChat`, demo-seed.ts ~861) throws `TransactionInactiveError`.
- Observed end state in the packaged app (fresh profile): Pulse seeds fully; Lumen stops before its chat thread
  (`chatThreads` 0, `workflowRuns` 0; everything earlier present); DraftDeck never starts; `loadDemo()` never reaches
  `setActiveProjectId(Pulse)`/`router.push("/dashboard")`, so the UI silently keeps the previous project and the
  button just flips back from "Loading…". Console shows the unhandled rejection.
- Browser/dev is unaffected: `secretsAvailable()` is false there, so `hydrateConnection` returns synchronously.
  Packaged-app-only bug.

Minimal fix (owner's call): resolve the AI connection **before** opening the seed transaction (hoist
`seedAiConnection()` out and pass the id in), or make `hydrateConnection`'s secret read not run inside an open
transaction. Reproduce: fresh packaged profile → `/settings` → Data → "Load demo projects".
