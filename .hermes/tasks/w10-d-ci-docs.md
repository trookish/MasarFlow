# Wave 10 / Stream D — P10.T13, T14 (CI + tagged-release workflows), P9.T24 (docs truth)

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plans: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p10-onboarding-release.md` tasks **P10.T13, P10.T14**, then `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p9-truth.md` task **P9.T24**.

CI (T13/T14):
- Read the existing `.github/` first and reconcile; don't duplicate.
- Pin action versions, use `windows-latest` for the desktop build, set `pnpm` with `nodeLinker: hoisted` (already in `pnpm-workspace.yaml`), and cache sensibly.
- The PR workflow runs: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm desktop:typecheck`, `pnpm test`, `pnpm build`. The browser e2e subset may run if cheap. The packaged smoke runs on Windows.
- The release workflow builds the NSIS installer on a `v*` tag and uploads it as a draft release. That requires `GH_TOKEN` from `secrets.GITHUB_TOKEN`; never hard-code anything.
- Validate the YAML locally (`actionlint` if available, otherwise a YAML parse plus a careful read). Nothing is pushed, so CI can't actually run. State that plainly, and list what the owner must check on the first push.

Docs truth (P9.T24):
- README claims must match what ships: no Python, no OpenCode, native providers, vault, git/GitHub, Today, the packaged Windows app, unsigned installer and SmartScreen.
- Add the AGENTS.md contract the plan describes, outside the `<!-- BEGIN:nextjs-agent-rules -->` block, which must stay byte-identical (verify with `git diff`).
- Keep README concise: a short README plus `docs/*.md` for detail. Leave `docs/ui-budget.md` alone (it was written last wave).

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. Where the plan contradicts itself, fix it minimally and list the change. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts`, run `pnpm exec next typegen` and retry. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report. The repo's lint treats `react-hooks/set-state-in-effect` and `react-hooks/purity` as errors. Use the render-time "adjust state" pattern or the repo's `eslint-disable-next-line ... -- reason` convention. Stop every server/Electron process you start. Never `git push`, tag or create a release. Your final message must be the written report itself, not a tool call.

Shared files (add only, re-read immediately before editing, commit right away in your task's pathspec commit, never drop another stream's lines): `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts`, root `package.json` `scripts` (add keys only; don't touch dependencies unless your task needs one, then say so).

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors). Every e2e spec you add or change must be run and its pass count reported.

Streams this wave (disjoint files):
- A (P9 packaged e2e harness, spec A, voice probe): `tests/e2e/desktop/**`, `tests/playwright.desktop.config.ts`, `src/lib/hooks/use-speech.ts`, voice UI call sites of `speechAvailability`.
- B (P9 route/nav guards, codeHighlighting, lint to zero, legacy browser smoke spec): `tests/unit/repo-truth/**`, `tests/e2e/smoke.spec.ts`, `tests/e2e/settings*.spec.ts`, the files that hold the 5 lint warnings (`src/components/shell/project-fields.tsx`, `src/components/dashboard/dashboard-view.tsx`, `scripts/dev-desktop.mjs`, any other warning site), and the `chat.codeHighlighting` consumer (markdown/code renderer in `src/components/chat/**` or `src/components/brain/markdown-preview.tsx`; read first, keep it surgical).
- C (P10 Control Center, auto-update, update proof, mac/linux config): `src/app/(workspace)/control-center/**`, `src/components/control-center/**`, `src/lib/nav.ts`, `src/lib/dock/registry.ts`, `src/components/dock/panel-loader.tsx`, `src/components/settings/settings-view.tsx`, `desktop/**` (all of it), `tests/unit/desktop/**`, `tests/unit/lib/dock/panels-guard.test.ts`, `tests/unit/nav-parity.test.ts`.
- D (P10 CI + release workflows, P9 docs truth): `.github/**`, `AGENTS.md` (outside the `nextjs-agent-rules` block, which must stay byte-identical), `README.md`, `docs/**` except `docs/ui-budget.md`.
Never edit another stream's files outside the shared list. If you need a change in one, describe it exactly in your report.
