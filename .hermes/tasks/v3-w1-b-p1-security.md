# Wave 1 · Stream B · P1 security

Read `.hermes/tasks/v3-00-shared-context.md` first. Then read the whole phase plan `.hermes/plans/2026-10-25_235321-masarflow-overhaul-v0-3-p1-security.md` (verified file:line facts and tasks T1–T7) and master §2 rows S1–S6 and decision D10.

Do **all P1 tasks** in plan order, TDD (failing test first, then fix), one commit per task.

Notes:
- Decision D10 (final): without `MASARFLOW_TOKEN` (dev mode) `proxy.ts` still enforces Host allow-list + Origin + `Sec-Fetch-Site` on `/api/*`; fs/shell roots fail closed unless `MASARFLOW_DATA_DIR` (packaged) or `MASARFLOW_DEV_ROOTS` (dev, `;`-separated) is set. Document `MASARFLOW_DEV_ROOTS` in `docs/development.md`. `pnpm e2e` (browser, dev server) must keep working: if `tests/playwright.config.ts` webServer env needs `MASARFLOW_DEV_ROOTS`, report the exact line under Needs-from-others (stream A owns playwright configs).
- Existing guard tests: `tests/unit/api/fs-routes-guarded.test.ts`, `tests/unit/proxy.test.ts`, `tests/unit/lib/server/*`. Keep them green or tighten them; never weaken.
- SSRF (T3): resolve DNS and reject loopback, link-local, private, CGNAT, multicast, `0.0.0.0/8`, IPv6 ULA/link-local and IPv4-mapped forms, on the first request AND every redirect hop (max 3 hops); remove `rejectUnauthorized: false`.
- Integration gate (mandatory): after your last code change build once with `node.exe .hermes/tools/build-snapshot.mjs b`, then `MASARFLOW_E2E_APP_DIR=<path> pnpm exec playwright test --config tests/playwright.desktop.config.ts tests/e2e/desktop/shell.spec.ts tests/e2e/desktop/sync.spec.ts tests/e2e/desktop/knowledge.spec.ts tests/e2e/desktop/files.spec.ts` and `pnpm security:check` (expects `SECURITY_CHECK_OK n/n`; add your new black-box cases to `scripts/security-check.mjs`). A green unit suite with a broken packaged app is a failure. Report the negative proofs (cross-origin POST → 403 in dev mode; redirect to 127.0.0.1 → rejected).

## Wave 1 ownership (a file absent from YOUR row must not be edited by you)

| Stream | Owns |
|---|---|
| A — P0 gates | `.github/workflows/*`, `docs/release.md`, `scripts/release-notes.mjs`, `scripts/doctor-data.mjs`, `src/lib/db/doctor.ts`, `tests/unit/lib/db/doctor.test.ts`, `tests/unit/scripts/**`, `tests/e2e/desktop/{audit-layout.spec.ts,a11y.spec.ts,a11y.helpers.ts}`, `eslint.config.mjs`, `package.json` (scripts block only), `reports/v0.3/**`, `tests/playwright.desktop.config.ts`, `tests/playwright.config.ts` |
| B — P1 security | `src/proxy.ts`, `src/lib/server/**`, `tests/unit/proxy.test.ts`, `tests/unit/lib/server/**`, `tests/unit/api/**`, `src/app/api/**` (route handlers), `src/components/canvas/nodes/web-node.tsx`, `src/components/brain/markdown-preview.tsx`, `desktop/src/main/security/**`, `tests/unit/desktop/csp.test.ts`, `scripts/security-check.mjs`, `SECURITY.md`, `docs/development.md` |
| C — P2 domain core | `src/lib/domain/**`, `src/lib/db/{index,schema,dirty}.ts`, `src/lib/db/repos/**`, `src/lib/activity/**`, `eslint-rules/**`, `tests/unit/lib/domain/**`, `tests/unit/lib/db/**` (except `doctor.test.ts`), `tests/unit/lib/activity/**`, `tests/unit/_fixtures/db/**`, `tests/e2e/desktop/domain.spec.ts` |
| D — P5 shell + IA | `src/lib/nav.ts`, `src/lib/navigation/**`, `src/app/(workspace)/layout.tsx`, new route dirs `src/app/(workspace)/{capture,work,library,ask,system}/**`, `src/lib/stores/{ui,dock}.ts`, `src/lib/dock/**`, `src/lib/hooks/use-dock-sync.ts`, `src/lib/hooks/use-hotkeys.ts`, `src/components/shell/**`, `src/components/dock/**`, `src/components/ui/{container,command}.tsx`, `next.config.ts`, `tests/unit/lib/navigation/**`, `tests/unit/lib/dock/**`, `tests/unit/nav-parity.test.ts`, `tests/unit/repo-truth/**`, `tests/e2e/desktop/{shell,dock}.spec.ts`, navigation helpers in `tests/e2e/desktop/_harness.ts`, `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts` |

Hot files nobody but the owner edits this wave: `package.json`, `eslint.config.mjs` (A), `src/lib/db/index.ts` (C), `layout.tsx` + `feature-matrix.json` + `next.config.ts` (D). The orchestrator applies "Needs from others" lines after the wave.
Build letters: A=`a`, B=`b`, C=`c`, D=`d`. Dev-server ports if unavoidable: A 3141, B 3142, C 3143, D 3144.
