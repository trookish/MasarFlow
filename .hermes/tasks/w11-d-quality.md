# Wave 11 / Stream D — P9.T19 a11y, P9.T20 perf budgets, P9.T21 memory soak, P9.T23 first-time journey

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p9-truth.md`, tasks **P9.T19, P9.T20, P9.T21, P9.T23**. Read `docs/ui-budget.md` (written in wave 9) and use its numbers as the budgets where the plan defers to it. If they disagree, the plan's numbers win, and you say so.

- **a11y (T19):** axe-core on each page in the packaged app, plus keyboard-only journeys.
  - Fix violations in files you own (shell, ui, onboarding).
  - For violations in sibling-owned components, use the plan's allow-list mechanism (if it has one) with exact rule id, selector and owner, and list them in your report. Never disable a rule globally.
  - Write `reports/p9/a11y/summary.json`.
- **Performance (T20):** measure cold start, dock operations and route navigation against the packaged app. Run each measurement at least three times and use the median. If a budget fails, report the real number; don't loosen the budget to pass. Write `reports/p9/perf-baseline.md` with machine details.
- **Memory soak (T21):** tag the spec `@slow` (`pnpm e2e:desktop:slow`). Run it once for real (it takes 10+ minutes; run it in the background and poll) and record the result.
- **First-time journey (T23):** this now goes through the P10 setup wizard (`src/components/onboarding/**`, `tests/e2e/onboarding.spec.ts`), from a fresh profile to a first project, a first note and a first task. Save the screenshots under `reports/p9/journey/` and write `reports/p9/first-run-journey.md`. Write the copy formally, in plain sentences.

## Packaged-app builds and e2e this wave (mandatory: four agents share one tree)
- **Never** run `pnpm desktop:dist:dir`, `pnpm build`, `pnpm build:app` or `next build` directly. They write `.next/` and `desktop/dist/`, and two at once corrupt both.
- To build: `node .hermes/tools/build-snapshot.mjs <your stream letter>`. It waits for a cross-agent lock, builds, copies the app to `%LOCALAPPDATA%/Temp/msf-e2e-<letter>/win-unpacked`, and prints an `export MASARFLOW_E2E_APP_DIR=...` line. Run that export, then `pnpm e2e:desktop tests/e2e/desktop/<your spec>.ts` (no `--`: pnpm swallows it). Your runs then boot your private copy, and a sibling's rebuild can't kill them.
- Rebuild only after app-code changes, and batch them: a build takes about 4 minutes and siblings queue behind you.
- The harness (`tests/e2e/desktop/_harness.ts`) owns the launch fixture, the fresh temp profile, `navigateTo(page, label)`, onboarding completion and the demo fixture. Read it first and reuse it. Add helpers to it only additively, and commit them right away. The packaged default layout is the bottom taskbar dock, so nav links live in dock group popups: use `navigateTo`, not `getByRole("link")`. `MASARFLOW_E2E=1` (set by the harness) disables the updater's launch check, so specs stay offline.
- The plan's spec code predates the dock layout, the setup wizard and the harness, so treat its locators as intent. Read the real components, use existing `data-testid`s, and add new ones (in files you own) where a locator would otherwise be brittle. Every spec must assert an outcome (data persisted, file on disk, text the app produced). "The page rendered" doesn't count.

## Rules for every task
- Plan line numbers and file names may have drifted. Search for the quoted text, read the real exports, and let the compiler win over the plan's literal text. Where the plan contradicts itself, fix it minimally and list the change.
- TDD for unit-testable logic (`pnpm exec vitest run --config tests/vitest.config.ts <files>`). For an app bug, write the failing spec or unit test first, then fix.
- Commit after each task, pathspec form (`git commit -m "<msg>" -- <paths>`).
- The repo's lint treats `react-hooks/set-state-in-effect`, `react-hooks/purity` and `react-hooks/rules-of-hooks` as errors. Playwright fixtures must not name a parameter `use`, because the hooks lint mistakes it for a hook; follow `_harness.ts`.
- If a gate fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report it.
- Stop every server and Electron process you start. Never `git push`, tag or release. Your final message must be the written report itself, not a tool call.

## Shared files
Add only. Re-read immediately before editing, commit right away in your own pathspec commit, and never drop another stream's lines:
- `tests/e2e/feature-matrix.json`: add your titles in the same commit as the spec that matches them, titled `<route>: <feature>` exactly.
- `tests/unit/e2e/feature-matrix.test.ts`: remove from `ROUTES_WITHOUT_FEATURES` only the routes you filled.
- `tests/e2e/desktop/_harness.ts`: additive helpers only.

## Exit gate
- Your unit tests pass, and your specs pass against your own fresh snapshot (report counts).
- `pnpm typecheck` and `pnpm lint` exit 0 with **0 warnings** (the tree is at zero; keep it there).
- `pnpm desktop:typecheck` exits 0 if you touched `desktop/`.

## Streams this wave (disjoint app files)
- **A (knowledge + planning):** `src/components/{brain,specs,tasks,sprints,standards,devlogs,workflow,knowledge,search,templates,graph}/**`, `src/components/dashboard/**`, their `src/app/(workspace)/...` pages, related `src/lib/**` helpers used only by those, `tests/e2e/desktop/{knowledge,planning}.spec.ts`.
- **B (studio + chat):** `src/components/{chat,agents,architecture,canvas,docs,watcher}/**`, `src/app/api/chat/**`, the voice button's call sites, `tests/e2e/desktop/{studio-chat,_stub-provider}.ts`, `reports/p9/chat-blocker.md`.
- **C (dock, tools, today, vault, git coverage):** `src/components/{dock,settings,today,tools,sync,files,git,vault}/**`, `src/lib/dock/**`, `tests/e2e/desktop/{dock,tools,today,vault,git}*.spec.ts`.
- **D (quality: a11y, perf, soak, journey):** `tests/e2e/desktop/{a11y,a11y.helpers,perf,perf-budgets,soak,journey}*.ts`, `reports/p9/{a11y,perf-*,first-run-journey*,journey}/**`, `src/components/shell/**`, `src/components/ui/**`, `src/components/onboarding/**`, root `package.json` devDependencies plus `pnpm-lock.yaml`. Install `@axe-core/playwright` as your **first** action so siblings pick it up early.

Never edit another stream's files outside the shared list. If a test you own exposes a bug in a sibling's file, describe it exactly (file, line, repro, proposed fix) in your report.
