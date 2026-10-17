# Wave 8 / Stream B — P6.T13–T19: commit⇄task linking, GitHub client/routes, issue sync, GitHub section, chat git awareness, failure coverage

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p6-git-github.md`, tasks **P6.T13 through P6.T19**. P6.T1–T12 are committed. Note the T12 report: `src/components/git/git-commit-box.tsx` ends `submit()` with `setCommitted({ sha, commitId: "" })`, and T13 must replace that line. `link-task-dialog.tsx` and `github-section.tsx` are stubs that render `null` until you fill them.

GitHub token: since P2.T8 the PAT lives in the secret store (`src/lib/stores/github.ts` + `src/lib/secrets-binding.ts`). The GitHub routes (`src/app/api/github/**`) run on the local Next server behind the launch-token guard. Never send the PAT anywhere except `api.github.com`, never log it, and tests use an injectable fetch with a fake token. If an old `src/app/api/github/route.ts` or `src/lib/github-sync.ts` exists, reconcile with it, don't duplicate it, and say what you did.

Dexie stays at v12 this phase (plan decision D-P6-3). `task.externalRef` is non-indexed.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. Where the plan contradicts itself, fix it minimally and list the change. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts`, run `pnpm exec next typegen` and retry. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report. Your final message must be the written report itself, not a tool call.

Shared files (several streams may need them): `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts`, `src/lib/nav.ts`, `src/lib/dock/registry.ts`, `src/components/dock/panel-loader.tsx`, `src/components/shell/shortcuts-dialog.tsx`. Add only. Re-read the file immediately before editing, keep the edit small, and commit it right away in the same pathspec commit as your task. Never drop another stream's lines.

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors). Any e2e spec you add must be run and its pass count reported.

Streams this wave (disjoint files):
- A (P5 backlinks/send-to + P7 properties in editors): `src/components/brain/note-editor.tsx`, `src/components/docs/doc-editor.tsx`, `src/components/specs/spec-editor.tsx`, `src/components/tasks/task-detail.tsx`, `src/components/chat/chat-view.tsx`, `src/components/entities/**`, `src/components/vault/{properties-panel,vault-path-hint}.tsx`, `src/lib/entities/send-to.ts`, `src/lib/vault/props.ts`.
- B (P6 GitHub + chat git awareness): `src/lib/git/**`, `src/components/git/**`, `src/lib/github/**`, `src/lib/github-sync.ts`, `src/app/api/github/**`, `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `src/lib/db/repos/{tasks,commits,links}.ts`, `src/lib/ai/{git-context,context,tools,workspace-tool-defs}.ts`.
- C (P7 vault panel, tags, quick switcher, daily notes): `src/components/sync/sync-view.tsx`, `src/components/vault/{vault-panel,quick-switcher}.tsx`, `src/lib/hooks/use-vault-sync.ts`, `src/lib/vault/{quick-switch,daily,tags}*.ts`, `src/lib/stores/vault.ts`, `src/lib/hooks/use-hotkeys.ts`, `src/lib/utils/markdown.ts`.
- D (P8 terminal, logs, system panels): `desktop/src/main/{pty,logs}.ts`, `desktop/src/main/ipc/**`, `desktop/src/shared/{channels,api,terminal}.ts`, `desktop/src/preload/index.ts`, `src/components/tools/**`, `src/app/(workspace)/tools/**`, `src/lib/desktop/**`.
Never edit another stream's files outside the shared list. If you need a change in one, describe it exactly in your report.
