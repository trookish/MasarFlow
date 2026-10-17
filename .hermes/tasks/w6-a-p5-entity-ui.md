# Wave 6 / Stream A — P5.T2, T5, T6a, T6b, T6c: entity kinds, open/title, entity links everywhere

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p5-fabric-chat-awareness.md`, tasks **P5.T2, P5.T5, P5.T6a, P5.T6b, P5.T6c** (stop before P5.T7). P5.T1/T3/T4 are committed: `src/lib/entities/{registry,url}.ts` and `src/lib/hooks/use-url-selection.ts`. The registry defines its own 14-kind `ENTITY_KINDS` and waits for T2's parity test. Make T2's `kinds-parity.test.ts` bind the registry, the schema `EntityKind` and the tool enums together.

In `schema.ts`, change only the `EntityKind` / `entityKindSchema` pieces. Dexie versions belong to later tasks.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts` (stale generated route types), run `pnpm exec next typegen` and retry. That is not a source error. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report.

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors).

Concurrent siblings (4 streams total, disjoint files):
- A (P5 entity UI): `src/lib/entities/**`, `src/lib/db/schema.ts`, `src/lib/ai/workspace-tool-defs.ts`, `src/lib/ai/tools.ts`, `src/lib/utils/{markdown-url,search}.ts`, `src/components/entities/**`, `src/components/brain/{markdown-preview,knowledge-graph}.tsx`, `src/components/sync/sync-view.tsx`, `src/components/shell/global-search.tsx`.
- B (P4 backup/recovery): `src/lib/db/{index,dirty,auto-backup,health}.ts`, `src/components/settings/**`, `src/components/shell/{auto-backup,db-gate}.tsx`, `src/app/(workspace)/layout.tsx`, `desktop/src/main/backups.ts`, and the shared desktop files `desktop/src/main/index.ts`, `desktop/src/main/ipc/index.ts`, `desktop/src/shared/{channels,api}.ts`, `desktop/src/preload/index.ts`.
- C (P6 git core): `desktop/src/main/git/**`, `desktop/src/shared/git.ts`, `tests/unit/desktop/git/**`.
- D (P8 dock core): `src/lib/dock/**`, `src/components/dock/**`, `src/components/ui/toaster.tsx` and any new `src/lib/toast*` module.
Never edit another stream's files. If you need a one-line change in one, describe it in your report instead.
