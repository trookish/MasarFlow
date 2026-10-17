# Wave 6 / Stream B — P4.T3–T6: backup UI, change tracking + disk backups, restore list, DB health

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p2-p3-p4-security-runtime-data.md`, tasks **P4.T3, P4.T4, P4.T5, P4.T6**. Skip P4.T7 (it is a v0.1.6 release on `main`, not this branch). P4.T1/T2 are committed: `src/lib/db/backup.ts` and `backup-import.ts`. Read them.

Disk backups are written by the Electron main process (`desktop/src/main/backups.ts`) into userData. Keep browser mode working: the UI must hide or disable the disk-backup parts when `window.masarflow` is absent. Backups must never contain API keys. Reuse the exporter, which already blanks them.

Also: `pnpm desktop:typecheck` exits 0. Near the end, `pnpm desktop:dist:dir && pnpm smoke:desktop` prints `SMOKE_OK`, so the new DB gate does not block the packaged boot. Run the plan's e2e specs for backup/recovery if it names any, and report pass counts.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts` (stale generated route types), run `pnpm exec next typegen` and retry. That is not a source error. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report.

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors).

Concurrent siblings (4 streams total, disjoint files):
- A (P5 entity UI): `src/lib/entities/**`, `src/lib/db/schema.ts`, `src/lib/ai/workspace-tool-defs.ts`, `src/lib/ai/tools.ts`, `src/lib/utils/{markdown-url,search}.ts`, `src/components/entities/**`, `src/components/brain/{markdown-preview,knowledge-graph}.tsx`, `src/components/sync/sync-view.tsx`, `src/components/shell/global-search.tsx`.
- B (P4 backup/recovery): `src/lib/db/{index,dirty,auto-backup,health}.ts`, `src/components/settings/**`, `src/components/shell/{auto-backup,db-gate}.tsx`, `src/app/(workspace)/layout.tsx`, `desktop/src/main/backups.ts`, and the shared desktop files `desktop/src/main/index.ts`, `desktop/src/main/ipc/index.ts`, `desktop/src/shared/{channels,api}.ts`, `desktop/src/preload/index.ts`.
- C (P6 git core): `desktop/src/main/git/**`, `desktop/src/shared/git.ts`, `tests/unit/desktop/git/**`.
- D (P8 dock core): `src/lib/dock/**`, `src/components/dock/**`, `src/components/ui/toaster.tsx` and any new `src/lib/toast*` module.
Never edit another stream's files. If you need a one-line change in one, describe it in your report instead.
