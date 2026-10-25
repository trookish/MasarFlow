# Wave 1 · Stream C · P2 domain core

Read `.hermes/tasks/v3-00-shared-context.md` first. Then read the whole phase plan `.hermes/plans/2026-10-25_235321-masarflow-overhaul-v0-3-p2-domain-core.md` and master decisions D2/D3.

Do P2 **T1–T5 and T7** plus a **reduced T6**. TDD, one commit per task.

Scope change (orchestrator, final): **T6 does not edit components.** Repo mutators (`src/lib/db/repos/*.ts`) become thin wrappers over the new `commands.*` (so every existing caller goes through commands, events and cascades), and repo live reads filter `isLive`. Components that call `db.<table>.<write>` directly migrate in a later wave: in T7 the ESLint rule runs as **warn** and your report lists the offenders (file:line). `eslint.config.mjs` is owned by stream A: create `eslint-rules/no-direct-db-writes.mjs` + a unit test (ESLint 9 `RuleTester`) and put the exact import + config lines under Needs-from-others.

Notes:
- Before writing `version(13)`, read `src/lib/db/index.ts` fully: copy each table's latest store string verbatim and append `, deletedAt` only for notes, docs, specs, tasks; add the `events` table. Confirm `version(12)` is the latest.
- vitest is node-only. Check whether `fake-indexeddb` is a devDependency and how existing tests under `tests/unit/lib/db/` open Dexie; follow that pattern exactly.
- Stream A lands `src/lib/db/doctor.ts` (`runDoctor`) early. Use it in T3/T5 tests once present (`ls src/lib/db/doctor.ts`); until then assert the orphan counts directly.
- Activity (T7): `activity` rows must keep appearing for user edits (the timeline depends on them). Write them from `runCommand`, then remove the Dexie hooks in `src/lib/activity/track.ts` only for tables now behind commands.
- Never await the secret store (or any non-Dexie promise) inside a Dexie transaction. Project delete: chat-secret cleanup before the transaction.
- P2 T4 packaged spec goes in NEW file `tests/e2e/desktop/domain.spec.ts`, titled `brain: create note from unresolved link`; the orchestrator adds the matrix entry. The "Create note" button belongs in the markdown preview's wikilink rendering, which stream B owns (`src/components/brain/markdown-preview.tsx`): report the exact JSX change instead, and mark the spec `test.fixme` until applied.
- Your gate: full `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0. Then `node.exe .hermes/tools/build-snapshot.mjs c` and `planning.spec.ts`, `knowledge.spec.ts`, `today.spec.ts`, `journey.spec.ts` must pass in the packaged app (they exercise the mutators you rewired).

## Wave 1 ownership (a file absent from YOUR row must not be edited by you)

| Stream | Owns |
|---|---|
| A — P0 gates | `.github/workflows/*`, `docs/release.md`, `scripts/release-notes.mjs`, `scripts/doctor-data.mjs`, `src/lib/db/doctor.ts`, `tests/unit/lib/db/doctor.test.ts`, `tests/unit/scripts/**`, `tests/e2e/desktop/{audit-layout.spec.ts,a11y.spec.ts,a11y.helpers.ts}`, `eslint.config.mjs`, `package.json` (scripts block only), `reports/v0.3/**`, `tests/playwright.desktop.config.ts`, `tests/playwright.config.ts` |
| B — P1 security | `src/proxy.ts`, `src/lib/server/**`, `tests/unit/proxy.test.ts`, `tests/unit/lib/server/**`, `tests/unit/api/**`, `src/app/api/**` (route handlers), `src/components/canvas/nodes/web-node.tsx`, `src/components/brain/markdown-preview.tsx`, `desktop/src/main/security/**`, `tests/unit/desktop/csp.test.ts`, `scripts/security-check.mjs`, `SECURITY.md`, `docs/development.md` |
| C — P2 domain core | `src/lib/domain/**`, `src/lib/db/{index,schema,dirty}.ts`, `src/lib/db/repos/**`, `src/lib/activity/**`, `eslint-rules/**`, `tests/unit/lib/domain/**`, `tests/unit/lib/db/**` (except `doctor.test.ts`), `tests/unit/lib/activity/**`, `tests/unit/_fixtures/db/**`, `tests/e2e/desktop/domain.spec.ts` |
| D — P5 shell + IA | `src/lib/nav.ts`, `src/lib/navigation/**`, `src/app/(workspace)/layout.tsx`, new route dirs `src/app/(workspace)/{capture,work,library,ask,system}/**`, `src/lib/stores/{ui,dock}.ts`, `src/lib/dock/**`, `src/lib/hooks/use-dock-sync.ts`, `src/lib/hooks/use-hotkeys.ts`, `src/components/shell/**`, `src/components/dock/**`, `src/components/ui/{container,command}.tsx`, `next.config.ts`, `tests/unit/lib/navigation/**`, `tests/unit/lib/dock/**`, `tests/unit/nav-parity.test.ts`, `tests/unit/repo-truth/**`, `tests/e2e/desktop/{shell,dock}.spec.ts`, navigation helpers in `tests/e2e/desktop/_harness.ts`, `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts` |

Hot files nobody but the owner edits this wave: `package.json`, `eslint.config.mjs` (A), `src/lib/db/index.ts` (C), `layout.tsx` + `feature-matrix.json` + `next.config.ts` (D). The orchestrator applies "Needs from others" lines after the wave.
Build letters: A=`a`, B=`b`, C=`c`, D=`d`. Dev-server ports if unavoidable: A 3141, B 3142, C 3143, D 3144.
