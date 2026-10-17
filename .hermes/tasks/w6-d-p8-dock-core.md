# Wave 6 / Stream D — P8.T1–T10: dock migrations, lifecycle, undo, toasts, crash isolation, tabs, DnD, keyboard

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p8-dock-frontend.md`, tasks **P8.T1 through P8.T10**. The dock was hardened on `main` before this branch, in commits `3c5177c` and `989a812` (placeholder sentinel, tab click vs drag threshold). Read `git show 3c5177c 989a812 --stat` and keep those fixes. The existing dock tests must stay green.

If P8.T4 toasts need a mount point in `src/app/(workspace)/layout.tsx` (Stream B owns it), check first whether a toaster is already mounted there. If not, put the exact one-line change in your report.

Also run the existing dock e2e specs, if any (`tests/e2e/*dock*`), and report pass counts, or say that none exist.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts` (stale generated route types), run `pnpm exec next typegen` and retry. That is not a source error. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report.

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors).

Concurrent siblings (4 streams total, disjoint files):
- A (P5 entity UI): `src/lib/entities/**`, `src/lib/db/schema.ts`, `src/lib/ai/workspace-tool-defs.ts`, `src/lib/ai/tools.ts`, `src/lib/utils/{markdown-url,search}.ts`, `src/components/entities/**`, `src/components/brain/{markdown-preview,knowledge-graph}.tsx`, `src/components/sync/sync-view.tsx`, `src/components/shell/global-search.tsx`.
- B (P4 backup/recovery): `src/lib/db/{index,dirty,auto-backup,health}.ts`, `src/components/settings/**`, `src/components/shell/{auto-backup,db-gate}.tsx`, `src/app/(workspace)/layout.tsx`, `desktop/src/main/backups.ts`, and the shared desktop files `desktop/src/main/index.ts`, `desktop/src/main/ipc/index.ts`, `desktop/src/shared/{channels,api}.ts`, `desktop/src/preload/index.ts`.
- C (P6 git core): `desktop/src/main/git/**`, `desktop/src/shared/git.ts`, `tests/unit/desktop/git/**`.
- D (P8 dock core): `src/lib/dock/**`, `src/components/dock/**`, `src/components/ui/toaster.tsx` and any new `src/lib/toast*` module.
Never edit another stream's files. If you need a one-line change in one, describe it in your report instead.
