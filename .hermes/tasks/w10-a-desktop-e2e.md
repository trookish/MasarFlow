# Wave 10 / Stream A — P9.T6, T7, T13: packaged-app e2e harness, spec A, voice probe

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p9-truth.md`, tasks **P9.T6, P9.T7, P9.T13**. This harness is the foundation for P9.T8–T10, T19–T21 and P10's packaged onboarding/Control Center specs, so make it solid, documented, and cheap to reuse.

Facts to build on:
- `scripts/smoke-desktop.mjs` and `scripts/smoke-boot-gate.mjs` already launch `desktop/dist/win-unpacked/MasarFlow.exe` (copied outside the repo) with Playwright `_electron`. A wave 6 stream also drove the packaged app with `_electron` and a throwaway `--user-data-dir`. Reuse that approach and read those scripts first.
- Every launch must use a fresh temp user-data dir, so it never touches the user's real `%APPDATA%\MasarFlow`. Clean it up, tolerating EPERM as smoke does.
- First run now shows the P10 setup wizard (`src/components/onboarding/setup-wizard.tsx`, `tests/e2e/onboarding.spec.ts`). Spec A covers first run through the wizard. Give the harness a helper that completes or skips onboarding for every other spec.
- Restart persistence: launch, create data, quit, relaunch with the same user-data dir. The data must survive and the loopback port must change (origin stays `masarflow://app`).

Add a root script `e2e:desktop` that builds nothing; it requires an existing `desktop/dist/win-unpacked`, with a clear message if it is missing. Run it after `pnpm desktop:dist:dir` and report the pass counts. Add spec A's feature titles to the feature matrix in the same commit as the spec.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. Where the plan contradicts itself, fix it minimally and list the change. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts`, run `pnpm exec next typegen` and retry. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report. The repo's lint treats `react-hooks/set-state-in-effect` and `react-hooks/purity` as errors. Use the render-time "adjust state" pattern or the repo's `eslint-disable-next-line ... -- reason` convention. Stop every server/Electron process you start. Never `git push`, tag or create a release. Your final message must be the written report itself, not a tool call.

Shared files (add only, re-read immediately before editing, commit right away in your task's pathspec commit, never drop another stream's lines): `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts`, root `package.json` `scripts` (add keys only; don't touch dependencies unless your task needs one, then say so).

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors). Every e2e spec you add or change must be run and its pass count reported.

Streams this wave (disjoint files):
- A (P9 packaged e2e harness, spec A, voice probe): `tests/e2e/desktop/**`, `tests/playwright.desktop.config.ts`, `src/lib/hooks/use-speech.ts`, voice UI call sites of `speechAvailability`.
- B (P9 route/nav guards, codeHighlighting, lint to zero, legacy browser smoke spec): `tests/unit/repo-truth/**`, `tests/e2e/smoke.spec.ts`, `tests/e2e/settings*.spec.ts`, the files that hold the 5 lint warnings (`src/components/shell/project-fields.tsx`, `src/components/dashboard/dashboard-view.tsx`, `scripts/dev-desktop.mjs`, any other warning site), and the `chat.codeHighlighting` consumer (markdown/code renderer in `src/components/chat/**` or `src/components/brain/markdown-preview.tsx`; read first, keep it surgical).
- C (P10 Control Center, auto-update, update proof, mac/linux config): `src/app/(workspace)/control-center/**`, `src/components/control-center/**`, `src/lib/nav.ts`, `src/lib/dock/registry.ts`, `src/components/dock/panel-loader.tsx`, `src/components/settings/settings-view.tsx`, `desktop/**` (all of it), `tests/unit/desktop/**`, `tests/unit/lib/dock/panels-guard.test.ts`, `tests/unit/nav-parity.test.ts`.
- D (P10 CI + release workflows, P9 docs truth): `.github/**`, `AGENTS.md` (outside the `nextjs-agent-rules` block, which must stay byte-identical), `README.md`, `docs/**` except `docs/ui-budget.md`.
Never edit another stream's files outside the shared list. If you need a change in one, describe it exactly in your report.
