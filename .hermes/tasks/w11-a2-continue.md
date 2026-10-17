# Wave 11 / Stream A continuation — finish P9.T8 + P9.T9 (original brief: w11-a-knowledge-planning.md)

## Continuation rules (read these first)
- Read `.hermes/tasks/00-shared-context.md`, then your original brief (named above). Its rules still apply: builds only through `node.exe .hermes/tools/build-snapshot.mjs <letter>`, then `export MASARFLOW_E2E_APP_DIR=...`, then `pnpm e2e:desktop tests/e2e/desktop/<spec>.ts`. Results and traces land in `%LOCALAPPDATA%/Temp/msf-e2e-<letter>/test-results/`. Always use `node.exe`, never `node`.
- A previous agent did the first part of this work and ran out of steps. Its work is on disk, so **read it before changing it**. The items below are what's left. Do them in order, and commit each one as soon as it passes, so a step limit can't lose it.
- **Don't commit `tests/e2e/feature-matrix.json` or `tests/unit/e2e/feature-matrix.test.ts`.** The parent commits them after all four streams finish. You may edit them, for example when you rename a test title, but keep every other stream's lines.
- **Never put probe/scratch specs in `tests/`.** Every sibling's build type-checks that folder. Put probes under `$LOCALAPPDATA/Temp/msf-probe-<letter>/` and run them with `--config tests/playwright.desktop.config.ts` plus an absolute path, or don't use probes at all.
- Before your final report, run `pnpm typecheck` and `pnpm exec eslint <your files>`, and make sure both are clean. The tree is currently at 0 errors and 0 warnings. Note: Playwright fixtures with no test-scoped fixtures use `base.extend<object, {...}>`, not `{}`, because lint rejects the empty type.
- Stop every app/server you start. Never push. Your final message is the written report: commit SHAs, real spec pass counts, and anything left over.

## Remaining work

Already committed: `10d6520` (note selection restored after a reload), `688b7b5` (dashboard New spec/New task on an open route).
On disk, uncommitted: `tests/e2e/desktop/knowledge.spec.ts`, `tests/e2e/desktop/planning.spec.ts`. Your matrix rows are already in the uncommitted matrix file.

1. Rebuild your snapshot. Siblings changed app code, including the dock container clipping.
2. Fix `knowledge.spec.ts`. The previous agent diagnosed all 8 failures:
   (a) `data-dock-url` stays the bare `/brain`, because the query lives in dock params. Assert the note with `page.url()` or the editor's title input, not the attribute.
   (b) In Connections, the mention button's accessible name includes the excerpt. Use the real DOM: `region "Connections"` with "Linked from (1)" and the chip "Note Dashboard UX", and `button "Connections 1"`, which opens the "Linked mentions" list. Match with a prefix regex, not an exact name.
   (c) `/brain/graph` and `/brain/templates` can't be reached through `navigateTo`. Open them through the command palette: the topbar button labelled "Command palette", then "Open Graph" or "Open Templates". Read `src/lib/commands/registry.ts` for the exact labels.
   (d) In `/knowledge`, the spec node's label is "SPEC-001" and its title is "Realtime Presence & Deploy Streams".
   (e) In `/search`, `filter({ has: panel.getByText(...) })` never matches. Use a role/name prefix regex on the result row.
   (f) The create-note test raced the 450 ms autosave. Wait until the list item shows the new title before calling `readTable`.
   Run it until it's green, then commit `test(desktop): P9.T8 packaged knowledge specs`.
3. Run `planning.spec.ts` packaged, fix it to green with the same discipline, and commit it.
4. In your report, list the deviations: `/workflow` asserts the real 16-step pipeline; the P5 task chip is proven through the seeded note→note wikilink. Also give the exact final test titles, so the parent can check them against the matrix.
