# Wave 6 / Stream C — P6.T1–T5: git types, parsers and service (main process, pure + TDD)

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p6-git-github.md`, tasks **P6.T1 through P6.T5** (stop before P6.T6, the IPC surface, which edits shared desktop files that Stream B owns this wave). Read the plan's "Decisions" section first.

Tests use real git in temp dirs where the plan says so (git is installed on this Windows box; check with `git --version`). Never point a test at this repository's own `.git`. Watch out for Windows: CRLF, `core.autocrlf`, path separators and quoting in argv. The plan's argv builder must not go through a shell.

Also: `pnpm desktop:typecheck` exits 0, and `pnpm exec vitest run --config tests/vitest.config.ts tests/unit/desktop` passes.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts` (stale generated route types), run `pnpm exec next typegen` and retry. That is not a source error. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report.

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors).

Concurrent siblings (4 streams total, disjoint files):
- A (P5 entity UI): `src/lib/entities/**`, `src/lib/db/schema.ts`, `src/lib/ai/workspace-tool-defs.ts`, `src/lib/ai/tools.ts`, `src/lib/utils/{markdown-url,search}.ts`, `src/components/entities/**`, `src/components/brain/{markdown-preview,knowledge-graph}.tsx`, `src/components/sync/sync-view.tsx`, `src/components/shell/global-search.tsx`.
- B (P4 backup/recovery): `src/lib/db/{index,dirty,auto-backup,health}.ts`, `src/components/settings/**`, `src/components/shell/{auto-backup,db-gate}.tsx`, `src/app/(workspace)/layout.tsx`, `desktop/src/main/backups.ts`, and the shared desktop files `desktop/src/main/index.ts`, `desktop/src/main/ipc/index.ts`, `desktop/src/shared/{channels,api}.ts`, `desktop/src/preload/index.ts`.
- C (P6 git core): `desktop/src/main/git/**`, `desktop/src/shared/git.ts`, `tests/unit/desktop/git/**`.
- D (P8 dock core): `src/lib/dock/**`, `src/components/dock/**`, `src/components/ui/toaster.tsx` and any new `src/lib/toast*` module.
Never edit another stream's files. If you need a one-line change in one, describe it in your report instead.
