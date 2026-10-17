# Wave 11 / Stream D continuation — finish P9.T19 a11y, P9.T20 perf write-up, P9.T21 soak, P9.T23 journey (original brief: w11-d-quality.md)

## Continuation rules (read these first)
- Read `.hermes/tasks/00-shared-context.md`, then your original brief (named above). Its rules still apply: builds only through `node.exe .hermes/tools/build-snapshot.mjs <letter>`, then `export MASARFLOW_E2E_APP_DIR=...`, then `pnpm e2e:desktop tests/e2e/desktop/<spec>.ts`. Results and traces land in `%LOCALAPPDATA%/Temp/msf-e2e-<letter>/test-results/`. Always use `node.exe`, never `node`.
- A previous agent did the first part of this work and ran out of steps. Its work is on disk, so **read it before changing it**. The items below are what's left. Do them in order, and commit each one as soon as it passes, so a step limit can't lose it.
- **Don't commit `tests/e2e/feature-matrix.json` or `tests/unit/e2e/feature-matrix.test.ts`.** The parent commits them after all four streams finish. You may edit them, for example when you rename a test title, but keep every other stream's lines.
- **Never put probe/scratch specs in `tests/`.** Every sibling's build type-checks that folder. Put probes under `$LOCALAPPDATA/Temp/msf-probe-<letter>/` and run them with `--config tests/playwright.desktop.config.ts` plus an absolute path, or don't use probes at all.
- Before your final report, run `pnpm typecheck` and `pnpm exec eslint <your files>`, and make sure both are clean. The tree is currently at 0 errors and 0 warnings. Note: Playwright fixtures with no test-scoped fixtures use `base.extend<object, {...}>`, not `{}`, because lint rejects the empty type.
- Stop every app/server you start. Never push. Your final message is the written report: commit SHAs, real spec pass counts, and anything left over.

## Remaining work

Already committed: `d6918f8` (a11y specs and fixes, `@axe-core/playwright`).
On disk, uncommitted: `a11y.spec.ts` (scan extended to /today, /tools/logs, /tools/system and the open palette; currently red), `reports/p9/a11y/summary.json`, `perf.spec.ts`, `perf-budgets.ts`, `reports/p9/perf-{cold-start,interaction}.json`, `soak.spec.ts`, `journey.spec.ts`.

1. Rebuild your snapshot.
2. **a11y:** the tests failed with `navigateTo: no link "System"` because the dock label is **"System Info"** (`src/lib/commands/registry.ts:56`). Fix the label, rerun `a11y.spec.ts` to green, and commit it with the summary. Siblings are changing dock and docs markup right now, so if new axe findings show up, allow-list them with exact rule, selector and owner, and keep stale-entry detection on.
3. **perf:** write `reports/p9/perf-baseline.md` from the two JSON files. Record:
   - the machine details;
   - every sample, with medians and p95s against the plan's budgets;
   - that every sample was taken while three sibling agents were building and running e2e on the same machine, so the numbers are pessimistic;
   - that neither the plan nor `docs/ui-budget.md` defines a first-run-to-wizard budget, so none is invented;
   - the dock/tab disagreement: `docs/ui-budget.md` says 50 ms, the plan says 250 ms; the plan wins, and the measured 7 ms meets both;
   - the deviations forced by the real app.
   Commit `perf.spec.ts`, `perf-budgets.ts`, the JSON files and the write-up.
4. **soak:** take the baseline sample at t=2 min (the budget is memory growth from minute 2 to minute 10). Run `pnpm e2e:desktop:slow tests/e2e/desktop/soak.spec.ts` once, for real, **in the background**, and poll the log. It takes 10+ minutes. Record the real numbers in `reports/p9/soak.md`, including a failure if it fails, and commit.
5. **journey:** run `journey.spec.ts` against your snapshot and fix it to green: fresh profile, setup wizard, first project, first note, first task. Save the screenshots under `reports/p9/journey/` and write `reports/p9/first-run-journey.md` in formal, plain sentences. Commit.
