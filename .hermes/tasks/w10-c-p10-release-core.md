# Wave 10 / Stream C — P10.T8, T9, T10, T12: Control Center, auto-update, update-path proof, mac/linux build config

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p10-onboarding-release.md`, tasks **P10.T8, P10.T9, P10.T10, P10.T12**. P10.T1–T7 and T11 are committed. Read `desktop/src/shared/{app-settings,version,diagnostics,log-rotation,window-behavior}.ts`, `desktop/src/main/{diagnostics,logging,settings}.ts`, and the tray menu in `desktop/src/main/index.ts`. The tray has a "Control Center" item that goes nowhere until T8 lands, and "Check for updates…" was omitted until T9. Wire both up.

Control Center (T8):
- Reuse P10.T6/T7 diagnostics and the P8.T15 system panel's report (`src/lib/tools/system.ts`). Don't copy strings.
- The P8 handoff says P10 owns log rotation and deletion, and the editable environment surface. Provider keys already live in the chat connections dialog (secret store, P2.T7), so link to it rather than duplicating it.
- Add a `/control-center` nav entry. `tests/unit/nav-parity.test.ts` and `tests/unit/lib/dock/panels-guard.test.ts` must stay green.

Auto-update (T9/T10): `electron-updater` with a GitHub Releases feed. Never publish. T10's proof must run fully locally (a local static feed served from a temp dir, or electron-updater's documented dev/test mode), with no network to github.com. If the plan's proof step is marked OWNER ACTION, do the local part, write down exactly what the owner must do, and leave it at that. The installer is unsigned, so document SmartScreen behaviour, but don't try to sign anything.

Also: `pnpm desktop:typecheck` exits 0. Near the end, `pnpm desktop:dist:dir && pnpm smoke:desktop && pnpm smoke:boot-gate` print `SMOKE_OK` and `BOOT_GATE_OK`. The updater must not run network checks in smoke mode or in dev, and must never block boot.

Rules for every task: plan line numbers and some file names are from 2026-10-17 and may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. Where the plan contradicts itself, fix it minimally and list the change. TDD where the plan gives tests (test → run FAIL → implement → run PASS) with `pnpm exec vitest run --config tests/vitest.config.ts <files>`. Commit after each task with the plan's message, pathspec form. If `pnpm typecheck` fails only in `.next/**/types/validator.ts`, run `pnpm exec next typegen` and retry. If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report. The repo's lint treats `react-hooks/set-state-in-effect` and `react-hooks/purity` as errors. Use the render-time "adjust state" pattern or the repo's `eslint-disable-next-line ... -- reason` convention. Stop every server/Electron process you start. Never `git push`, tag or create a release. Your final message must be the written report itself, not a tool call.

Shared files (add only, re-read immediately before editing, commit right away in your task's pathspec commit, never drop another stream's lines): `tests/e2e/feature-matrix.json`, `tests/unit/e2e/feature-matrix.test.ts`, root `package.json` `scripts` (add keys only; don't touch dependencies unless your task needs one, then say so).

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0 (0 errors). Every e2e spec you add or change must be run and its pass count reported.

Streams this wave (disjoint files):
- A (P9 packaged e2e harness, spec A, voice probe): `tests/e2e/desktop/**`, `tests/playwright.desktop.config.ts`, `src/lib/hooks/use-speech.ts`, voice UI call sites of `speechAvailability`.
- B (P9 route/nav guards, codeHighlighting, lint to zero, legacy browser smoke spec): `tests/unit/repo-truth/**`, `tests/e2e/smoke.spec.ts`, `tests/e2e/settings*.spec.ts`, the files that hold the 5 lint warnings (`src/components/shell/project-fields.tsx`, `src/components/dashboard/dashboard-view.tsx`, `scripts/dev-desktop.mjs`, any other warning site), and the `chat.codeHighlighting` consumer (markdown/code renderer in `src/components/chat/**` or `src/components/brain/markdown-preview.tsx`; read first, keep it surgical).
- C (P10 Control Center, auto-update, update proof, mac/linux config): `src/app/(workspace)/control-center/**`, `src/components/control-center/**`, `src/lib/nav.ts`, `src/lib/dock/registry.ts`, `src/components/dock/panel-loader.tsx`, `src/components/settings/settings-view.tsx`, `desktop/**` (all of it), `tests/unit/desktop/**`, `tests/unit/lib/dock/panels-guard.test.ts`, `tests/unit/nav-parity.test.ts`.
- D (P10 CI + release workflows, P9 docs truth): `.github/**`, `AGENTS.md` (outside the `nextjs-agent-rules` block, which must stay byte-identical), `README.md`, `docs/**` except `docs/ui-budget.md`.
Never edit another stream's files outside the shared list. If you need a change in one, describe it exactly in your report.
