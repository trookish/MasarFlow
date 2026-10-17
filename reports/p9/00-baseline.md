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
