# Wave 7 / Stream C — P7.T1–T9: vault frontmatter, paths, serializers, sync policy, executor, binding store, view model

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p7-vault.md`, tasks **P7.T1 through P7.T9** (stop before P7.T10, the UI). Read the plan's header and decisions first.

Dependencies already in the repo: `src/lib/db/dirty.ts` (P4), `src/lib/entities/{registry,open}.ts` (P5), `src/lib/server/roots.ts` + `/api/fs/*` with `assertRootAllowed` (P2). The P5 `activity` table (Dexie v12) is being added by Stream A in parallel. If a vault task needs it, code against an injected interface and write in the report what to wire later.

The executor (P7.T7) writes real files only inside temp dirs in tests (the P7.T6 harness). It must never write outside the bound vault root. Its write-guard must be tested with a `..` escape and an absolute-path escape. Windows paths matter: backslashes, drive letters, reserved names (`CON`, `NUL`), trailing dots and spaces. Cover them in P7.T2's path guard tests.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. Where the plan contradicts itself, fix it minimally and list the change in your report. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts`, run `pnpm exec next typegen` and retry. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report. Your final message must be the written report itself, not a tool call.

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors).

Concurrent siblings (4 streams, disjoint files):
- A (P5 activity + awareness): `src/lib/db/{schema,index}.ts`, `src/lib/db/repos/{activity,index}.ts`, `src/lib/db/backup.ts`, `src/lib/activity/**`, `src/lib/hooks/use-activity-tracking.ts`, `src/lib/ai/{active-context,context,tools,workspace-tool-defs}.ts`, `src/lib/db/demo-seed.ts`.
- B (P6 git IPC + UI): `desktop/src/main/git/exec.ts`, `desktop/src/main/ipc/**`, `desktop/src/shared/{channels,api}.ts`, `desktop/src/preload/index.ts`, `src/lib/git/**`, `src/components/git/**`, `src/app/(workspace)/git/**`, `src/lib/nav.ts`, `src/lib/dock/registry.ts`, `src/components/dock/panel-loader.tsx`, `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts`.
- C (P7 vault core): `src/lib/vault/**`, `src/lib/stores/vault.ts`, `tests/unit/lib/vault/**`.
- D (P8 workspace menu + commands + recents): `src/components/dock/workspace-menu.tsx`, `src/lib/commands/**`, `src/lib/recents*.ts` / `src/lib/stores/recents.ts`, matching tests.
Never edit another stream's files. If you need a change in one, describe it exactly in your report instead.
