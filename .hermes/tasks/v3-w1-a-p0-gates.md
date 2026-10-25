# Wave 1 · Stream A · P0 baseline gates

Read `.hermes/tasks/v3-00-shared-context.md` first. Then read the whole phase plan `.hermes/plans/2026-10-25_235321-masarflow-overhaul-v0-3-p0-baseline-gates.md` and master §3 (release gate).

Do P0 **T2–T8** (T1 was done by the orchestrator in commit `d35ff8b`). Order: T5 (doctor; stream C imports `runDoctor` from `src/lib/db/doctor.ts` — land and commit it FIRST, within your first ~30 steps), T8, T4, T2, T3, T6, T7.

Notes:
- `src/lib/db/doctor.ts`: `runDoctor(db)` returning `{ checks: Array<{ name, count, samples }> }` with at least `dangling-links`, `stale-linked-task-ids`, `orphan-project-rows`, `duplicate-sync-paths`, `sync-rows-without-entity`. Read table names from `src/lib/db/index.ts` (do not edit it; stream C is adding `version(13)` with `events` and `deletedAt` — treat rows with non-null `deletedAt` as not live when the field exists). vitest is node-only: use `fake-indexeddb` only if it is already a devDependency and existing db tests use it; otherwise test the check functions over plain arrays.
- `scripts/doctor-data.mjs` (`pnpm doctor:data`) may run the doctor inside the packaged app via CDP/the harness if Dexie needs a browser; choose what actually works and document it in `docs/release.md`.
- The existing a11y spec is `tests/e2e/desktop/a11y.spec.ts` (+ `a11y.helpers.ts`) with evidence in `reports/p9/a11y/`. T7: write v0.3 evidence to `reports/v0.3/a11y/summary.json`, remove the allow-list mechanism, run in **report mode** by default (writes violations, passes) and fail mode with `MASARFLOW_A11Y_STRICT=1`; P7 flips the default. T6 layout harness likewise (`MASARFLOW_LAYOUT_STRICT=1`). Both run in the packaged app and write JSON.
- CI YAML must parse: `python3 -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" <file>`; if `yaml` is unavailable, say so and validate another way.
- Your gate: full `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm desktop:typecheck` exit 0; one packaged run of `audit-layout.spec.ts` + `a11y.spec.ts` producing both JSON files (commit them under `reports/v0.3/`).

## Wave 1 ownership (a file absent from YOUR row must not be edited by you)

| Stream | Owns |
|---|---|
| A — P0 gates | `.github/workflows/*`, `docs/release.md`, `scripts/release-notes.mjs`, `scripts/doctor-data.mjs`, `src/lib/db/doctor.ts`, `tests/unit/lib/db/doctor.test.ts`, `tests/unit/scripts/**`, `tests/e2e/desktop/{audit-layout.spec.ts,a11y.spec.ts,a11y.helpers.ts}`, `eslint.config.mjs`, `package.json` (scripts block only), `reports/v0.3/**`, `tests/playwright.desktop.config.ts`, `tests/playwright.config.ts` |
| B — P1 security | `src/proxy.ts`, `src/lib/server/**`, `tests/unit/proxy.test.ts`, `tests/unit/lib/server/**`, `tests/unit/api/**`, `src/app/api/**` (route handlers), `src/components/canvas/nodes/web-node.tsx`, `src/components/brain/markdown-preview.tsx`, `desktop/src/main/security/**`, `tests/unit/desktop/csp.test.ts`, `scripts/security-check.mjs`, `SECURITY.md`, `docs/development.md` |
| C — P2 domain core | `src/lib/domain/**`, `src/lib/db/{index,schema,dirty}.ts`, `src/lib/db/repos/**`, `src/lib/activity/**`, `eslint-rules/**`, `tests/unit/lib/domain/**`, `tests/unit/lib/db/**` (except `doctor.test.ts`), `tests/unit/lib/activity/**`, `tests/unit/_fixtures/db/**`, `tests/e2e/desktop/domain.spec.ts` |
| D — P5 shell + IA | `src/lib/nav.ts`, `src/lib/navigation/**`, `src/app/(workspace)/layout.tsx`, new route dirs `src/app/(workspace)/{capture,work,library,ask,system}/**`, `src/lib/stores/{ui,dock}.ts`, `src/lib/dock/**`, `src/lib/hooks/use-dock-sync.ts`, `src/lib/hooks/use-hotkeys.ts`, `src/components/shell/**`, `src/components/dock/**`, `src/components/ui/{container,command}.tsx`, `next.config.ts`, `tests/unit/lib/navigation/**`, `tests/unit/lib/dock/**`, `tests/unit/nav-parity.test.ts`, `tests/unit/repo-truth/**`, `tests/e2e/desktop/{shell,dock}.spec.ts`, navigation helpers in `tests/e2e/desktop/_harness.ts`, `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts` |

Hot files nobody but the owner edits this wave: `package.json`, `eslint.config.mjs` (A), `src/lib/db/index.ts` (C), `layout.tsx` + `feature-matrix.json` + `next.config.ts` (D). The orchestrator applies "Needs from others" lines after the wave.
Build letters: A=`a`, B=`b`, C=`c`, D=`d`. Dev-server ports if unavoidable: A 3141, B 3142, C 3143, D 3144.
