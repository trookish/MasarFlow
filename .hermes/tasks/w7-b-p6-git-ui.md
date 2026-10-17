# Wave 7 / Stream B — P6.T6–T12: git IPC, renderer bridge, /git route, status/diff/commit/branch/log UI

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p6-git-github.md`, tasks **P6.T6 through P6.T12**. P6.T1–T5 are committed: `desktop/src/shared/git.ts` and `desktop/src/main/git/{run,parse-status,parse-refs,parse-diff,service}.ts`. Read them. Note the T5 report's fixes: short-sha commit regex, and an argv prelude of 4 elements.

Every git IPC call takes a repo root, which must pass the P2 roots allow-list (`desktop/src/main/security/roots.ts`, `isRootAllowed`). An unlinked folder is refused in main, not just in the UI. Add a test for that refusal.

`exec.ts` uses `execFile` (no shell). Prove the service against real git once: a scratch test or script in a temp repo under the Windows temp dir, never this repo's `.git`. It should run init → status → stage → commit → log and report the output.

Also: `pnpm desktop:typecheck` exits 0, and near the end `pnpm desktop:dist:dir && pnpm smoke:desktop` prints `SMOKE_OK`. If P6.T12 or anything else needs `src/app/(workspace)/layout.tsx`, describe it instead of editing. Feature matrix: add the `/git` route and its features. The P0 guard requires e2e titles for features, so add a browser-mode spec that at least asserts the "desktop only" state of `/git` without `window.masarflow`, and run it.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. Where the plan contradicts itself, fix it minimally and list the change in your report. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts`, run `pnpm exec next typegen` and retry. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report. Your final message must be the written report itself, not a tool call.

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors).

Concurrent siblings (4 streams, disjoint files):
- A (P5 activity + awareness): `src/lib/db/{schema,index}.ts`, `src/lib/db/repos/{activity,index}.ts`, `src/lib/db/backup.ts`, `src/lib/activity/**`, `src/lib/hooks/use-activity-tracking.ts`, `src/lib/ai/{active-context,context,tools,workspace-tool-defs}.ts`, `src/lib/db/demo-seed.ts`.
- B (P6 git IPC + UI): `desktop/src/main/git/exec.ts`, `desktop/src/main/ipc/**`, `desktop/src/shared/{channels,api}.ts`, `desktop/src/preload/index.ts`, `src/lib/git/**`, `src/components/git/**`, `src/app/(workspace)/git/**`, `src/lib/nav.ts`, `src/lib/dock/registry.ts`, `src/components/dock/panel-loader.tsx`, `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts`.
- C (P7 vault core): `src/lib/vault/**`, `src/lib/stores/vault.ts`, `tests/unit/lib/vault/**`.
- D (P8 workspace menu + commands + recents): `src/components/dock/workspace-menu.tsx`, `src/lib/commands/**`, `src/lib/recents*.ts` / `src/lib/stores/recents.ts`, matching tests.
Never edit another stream's files. If you need a change in one, describe it exactly in your report instead.
