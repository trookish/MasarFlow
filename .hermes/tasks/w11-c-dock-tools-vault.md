# Wave 11 / Stream C — P9.T18 matrix sweep (dock, tools, today, vault, files, git) + dock overlap bug

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p9-truth.md` task **P9.T18**, plus the **P8 → P9 handoff** list at the end of `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p8-dock-frontend.md` (17 titles) and P7's vault titles in `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p7-*.md` (find the handoff section with `rg -n "Handoff" .hermes/plans/*p7*`).

Your routes: `/today`, `/tools/terminal`, `/tools/logs`, `/tools/system`, `/sync`, `/files`, plus extra depth on `/git`. The P8 dock titles that start with `dock:` aren't routes. Read `tests/unit/e2e/feature-matrix.test.ts` to see how keys are validated, then file them under the route where the behaviour is exercised (e.g. `/dashboard`). State what you chose.
- **Vault and Git specs** need a real linked folder. Create a temp dir and link it. The native folder picker can't be driven, so read how the onboarding/vault code registers a root (`desktop/src/main/security/roots.ts`, the `roots` IPC) and add a test-only path only if one already exists, or a harness helper that calls the real IPC from the renderer. **Never** weaken the root guard to make a test pass.
- **`/files` and `/sync`:** assert files really exist on disk.
- **Terminal:** run `echo ok` in a linked folder, and assert that an unlinked folder is refused with the app's message.

**Bug: tiled dock panes overlap.** At 1280×720 and 1680×1000, the Settings panel's 208 px `w-52` nav overflows into the neighbouring Brain pane and steals its pointer events (note list rows, the Read tab). Find the root cause in the dock's group/panel containers (likely a missing `min-w-0` / `overflow-hidden` / `contain` on the panel body, so content can exceed the split's track). Fix it for every panel, not just Settings. Write a packaged spec first that splits Settings beside Brain and clicks a note row, and confirm it fails before the fix.

When you finish, list every route still in `ROUTES_WITHOUT_FEATURES` and who owns it.

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
