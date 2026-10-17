# Wave 5 / Stream A — P1b.T11–T15: finish removing OpenCode, provider e2e proof

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p1b-ai-providers.md`, tasks **P1b.T11 through P1b.T15**. P1b.T1–T10 are committed. `chat-view.tsx` has no OpenCode left. The Python service and `desktop/src/main/{env,setup}.ts` are already deleted, so skip any step that edits a file that no longer exists and say so in the report. Plan line numbers are from 2026-10-17 and have drifted, so search for the quoted text.

P1b.T8 step 6 was skipped last wave because another stream owned `settings-view.tsx`. You own that file now. Add the Settings → AI ordered fallback list as P1b.T8 step 6 describes, in the same commit as T11.

You OWN: `src/components/settings/settings-view.tsx`, `src/lib/stores/page-settings.ts`, `src/lib/ai/catalog.ts`, `src/lib/ai/context.ts`, `src/lib/ai/agent/**`, `src/lib/ai/workspace-tool-defs.ts`, `src/lib/ai/tools.ts`, `src/lib/opencode/**`, `src/app/api/opencode/**`, `src/lib/ai/opencode-client.ts`, `tests/unit/repo/no-opencode.test.ts`, `tests/e2e/chat-*.spec.ts`, `tests/e2e/feature-matrix.json`.
Shared helper `tests/unit/_helpers/fs-scan.ts`: add only, never change existing exports, and re-read it right before editing, since Stream C may also add to it.

P1b.T15 e2e: provider calls must be mocked at the network layer (Playwright `page.route`), so no real API key is needed. Never put a real key in a test or fixture.

TDD where the plan gives tests:
`pnpm exec vitest run --config tests/vitest.config.ts <files>`.

Exit gate (report real output):
- `git grep -in opencode -- src desktop/src scripts` prints only the allowed leftovers that T14's guard test lists.
- `pnpm test`, `pnpm typecheck`, `pnpm desktop:typecheck`, `pnpm lint` all exit 0.
- `pnpm build` exits 0, and the T15 e2e spec passes against it (report the pass count).

Commit after each task with the plan's message, pathspec form.

Concurrent siblings: Stream B (`src/lib/secrets*.ts`, `src/lib/db/repos/chat*.ts`, `src/lib/stores/{github,obsidian}.ts`, `src/components/shell/secrets-bootstrap.tsx`, `src/app/(workspace)/layout.tsx`, `scripts/security-check.mjs`); Stream C (`src/lib/entities/**`, `src/lib/hooks/use-url-selection.ts`, `src/components/{agents,sprints,devlogs}/**`). Do not touch their files. If a build fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report.
