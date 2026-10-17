# Wave 9 / Stream D — P9.T1, T2, T5, T12, T14–T17: truth baseline, dead-route + setting-consumer guards, speech helper, plugin deletions

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p9-truth.md`, tasks **P9.T1, P9.T2, P9.T5, P9.T12, P9.T14, P9.T15, P9.T16, P9.T17**. Skip T3/T4 (nav/route parity while nav is changing) and T6 onward (the packaged e2e harness, a later wave).

Read master §2 F1–F12 and §10 first. Several items may already be partly resolved by earlier phases: Python, OpenCode and the launcher are gone; vault sync (P7) and GitHub (P6) now exist. For P9.T16 (`obsidian-sync` + `github-commits`), decide wire vs delete against what P6/P7 actually shipped, and justify the choice. Don't delete a plugin entry whose feature now works.

The P0 plugin-consumer guard (`tests/unit/lib/plugins-consumers.test.ts`) must reach an empty allow-list in T17. `reports/` may be gitignored; check `.gitignore`. If it is, write the baseline where the plan says and commit only what git tracks.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. Where the plan contradicts itself, fix it minimally and list the change. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts`, run `pnpm exec next typegen` and retry. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report. The repo's lint treats `react-hooks/set-state-in-effect` as an error. Use the render-time "adjust state" pattern, or the repo's existing `eslint-disable-next-line ... -- reason` convention where an effect is truly needed. Don't start dev servers unless a task requires one, and stop any you start. Your final message must be the written report itself, not a tool call.

Shared files (add only, re-read immediately before editing, commit right away in your task's pathspec commit, never drop another stream's lines): `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts`, `src/lib/dock/registry.ts`, `src/components/dock/panel-loader.tsx`, `src/components/shell/shortcuts-dialog.tsx`, `src/lib/plugins.ts` (D deletes entries, the others only read it).

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors). Any e2e spec you add must be run and its pass count reported.

Streams this wave (disjoint files):
- A (P8 Today + nav): `src/lib/nav.ts`, `src/lib/today/**`, `src/components/today/**`, `src/app/(workspace)/today/**`, `src/components/shell/sidebar.tsx`, `src/lib/db/schema.ts`, `src/lib/db/repos/tasks.ts`, `src/components/tasks/**`, `tests/unit/nav-parity.test.ts`.
- B (P8 palette, compact mode, quality budget): `src/components/shell/{command-palette,topbar}.tsx`, `src/lib/ui/{focus-trap,viewport}.ts`, `src/lib/hooks/{use-focus-trap,use-narrow-viewport,use-dock-sync}.ts`, `src/components/dock/dock-workspace.tsx`, `src/lib/entities/open.ts`, `tests/unit/ui/**`. B needs a compact-mode change in `sidebar.tsx` (owned by A): B describes it exactly and does not edit it.
- C (P10 desktop settings, version, onboarding core, diagnostics, tray): `desktop/src/**` (all of it this wave), `src/lib/onboarding/**`, `src/components/onboarding/**`, `tests/unit/desktop/**`, `tests/unit/lib/onboarding/**`.
- D (P9 truth guards + plugin deletions): `scripts/truth-scan.mjs`, `tests/unit/repo-truth/**`, `src/lib/hooks/use-speech.ts`, `src/lib/plugins.ts`, `src/lib/canvas-*.ts`, `src/components/canvas/**`, `tests/unit/lib/plugins-consumers.test.ts`, `src/lib/ai/fs-tools.ts`, `reports/**`.
Never edit another stream's files outside the shared list. If you need a change in one, describe it exactly in your report.
