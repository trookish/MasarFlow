# Shared context for every stream (UI overhaul P3-P7)

Read this whole file first. Then read ONLY your brief and the plan sections it names.

Repo: `C:/Users/trookish/Dev/Web-Projects/MasarFlow` (Windows, git-bash; use POSIX syntax in `terminal`). Branch `overhaul/v0.3`. The tree is uncommitted and dirty on purpose: it holds finished Phase 1 and 2 work. Do not "clean" it.
Product: MasarFlow is a desktop-only Electron app (Next.js renderer, Dexie/IndexedDB, embedded server). There is no browser build. `AGENTS.md` applies: this is NOT the Next.js you know; when you touch Next APIs read `node_modules/next/dist/docs/` first.
Plan of record: `.hermes/plans/2026-10-28_150000-masarflow-ui-overhaul.md`. Goal file with checklist: `.hermes/plans/2026-10-31_goal-ui-overhaul-p3-p7.md`.

## Hard rules
1. NEVER: commit, push, amend, stash, reset, rebase, checkout/switch branch, `git clean`, delete a test/spec/matrix entry/guard, skip/xfail a test, loosen an assertion to make it pass. Never touch `.env*`, `reports/`, `desktop/dist/` or `desktop/dist/win-unpacked`.
2. Never kill a process you did not start. Never run `taskkill` on node/electron by name. Other streams work in this same tree and run packaged apps at the same time.
3. Edit ONLY files in your brief's ownership list. If you need a change elsewhere (a serialised file or a peer's file), do not make it: put it in your final report under "Requests to the parent" with the exact change. Tiny additive imports of your own new modules from a peer's barrel are also requests.
4. Serialised files (single owner, see your brief): `src/app/(workspace)/layout.tsx`, `src/lib/stores/ui.ts`, `src/lib/stores/dock.ts`, `src/lib/navigation/surfaces.ts`, `src/lib/entities/registry.ts`, `src/app/globals.css`, `tests/e2e/feature-matrix.json`, `tests/e2e/desktop/_harness.ts`.
5. Peers are editing the same tree. A typecheck/lint error in a file you do not own is not yours: wait 2 minutes, re-run once, and if it persists list it under "Requests to the parent". Never "fix" a peer's file.
6. Behaviour preservation: every feature a page has today stays. Existing specs for your pages must still pass. A giant-component split lands behaviour-preserving first (existing specs green), then the redesign.
7. No text smaller than 12px (`text-xs` minimum; no `text-[10px]`, `text-[11px]`, etc). Formal professional copy: no emoji, no exclamation marks, no casual interjections ("Nothing selected." not "Nothing here yet!"). Every section/control that is not self-evident gets an `aria-label` or a hover `title` explanation. Real empty, loading (skeleton) and error states on every page.
8. Style: match the repo. Import `cn` from `@/lib/utils/cn`. Use `ConfirmDialog` for destructive confirmation (never `window.confirm`). Page chrome comes from `@/components/page` (PageFrame, PageHeader, Toolbar, Panel, SplitPane, EmptyState, Skeleton) and the archetypes in `src/lib/ui/archetype.ts`. Read `src/components/tasks/tasks-view.tsx` first: it is the one page already on the shell. Use theme tokens (`bg-card`, `text-muted-foreground`, `border-border`, ...), never hard-coded hex. Density: `--row-h` 36 or 28 px.
9. Never await the secret store inside a Dexie transaction. Do not add network calls, telemetry or new dependencies without listing them in your report (prefer none).
10. The docs claim only what exists. Do not write README/CHANGELOG claims; the parent does that in P7.

## File editing on Windows (CRLF)
Working-copy files are CRLF. If you edit with `execute_code`/Python: `open(p, encoding="utf8", newline="")`, assert `s.count(old) == 1`, replace, write back with `newline=""` so CRLF survives. `patch`/`write_file` are fine for new files; after writing a NEW file, convert to CRLF only if prettier or `git diff --stat` shows whole-file noise. Read a file before `write_file` over it. Run prettier only on files you created: `pnpm exec prettier --write <files>` then restore CRLF.

## Tests: what "done" means
- Unit tests: `tests/unit/...` mirroring `src/`. Run: `pnpm exec vitest run --config tests/vitest.config.ts <paths> --reporter=dot` (the `--config` flag is mandatory).
- Packaged-app specs: `tests/e2e/desktop/<name>.spec.ts`, new file per stream. Title format `<route>: <feature>` (example `/tasks: group by sprint`). Use `_harness.ts` helpers (`test`, `expect`, `navigateTo`, `surfacePanel`, `readTable`, `setWindowContentSize`, `addStubConnection`, `seedDemoProjects`, ...); read `tests/e2e/desktop/tabs.spec.ts` and `inspector.spec.ts` for the idiom. A spec that only asserts "the page rendered" is not a test: assert the behaviour (create, edit, persist after reload, keyboard path).
- Matrix: for each new feature add its feature name under its route in `tests/e2e/feature-matrix.json` with the tool (it takes a lock, keeps the compact CRLF format):
  `node.exe .hermes/tools/matrix-add.mjs "/tasks" "group by sprint" ["/route" "feature" ...]`
  The title in the spec must be exactly `<route>: <feature>`. `tests/unit/e2e/feature-matrix.test.ts` fails otherwise.
- Static checks (run before you report; all must exit 0 for files you own): `pnpm exec tsc --noEmit -p tsconfig.json` (if stale route types error: `rm -rf .next/types .next/dev/types` and retry once), `pnpm run lint`, and the unit tests of your area. If lint/tsc fails only in peers' files, say so.
- Page shell guard: `tests/unit/repo-truth/page-shell-adoption.test.ts` has an allow-list of routes not yet on the shell. When you migrate a page, delete ITS line (and only that line) in the same change; re-read the file right before you edit it, and verify afterwards that peers' lines are intact. The list must end empty.

## Build and run the packaged app (the only thing e2e tests run against)
Never run `pnpm desktop:dist:dir` (it overwrites `desktop/dist/win-unpacked`). Use the locked builder; it builds into `desktop/dist-e2e` and copies to a private per-stream folder. Replace `<L>` with your stream letter (a-z, given in your brief):
```
unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION MASARFLOW_DATA_DIR
node.exe .hermes/tools/build-e2e.mjs <L> > "$TMPDIR/build-<L>.log" 2>&1     # run with terminal background=true, notify=true
```
(`node` is aliased to winpty in git-bash and does nothing when piped: always `node.exe`.) A build takes 4 to 10 minutes and may queue behind a peer's build (it prints "Another stream is building"). Wait with `process_manage` (wait), never with a sleep longer than 400 s, and never start a second build while yours runs. Success = the log contains `BUILD_E2E_OK <dir>`; failure = `BUILD_E2E_FAIL`, the first error is above it. Then:
```
export MASARFLOW_E2E_APP_DIR='<dir from the log>'
pnpm exec playwright test --config tests/playwright.desktop.config.ts tests/e2e/desktop/<yourfile>.spec.ts --reporter=line
```
Run ONLY your own spec files (plus existing specs of pages you changed, by file). Do NOT run the whole gate; the parent runs it. One Playwright process at a time per stream. A failing spec you cannot fix after three honest attempts at the ROOT CAUSE: stop and report it with the error text; do not weaken it. If a failure looks like a flake, re-run that single test 3 times and report the counts.
Screenshots: write a throwaway `tests/e2e/desktop/zz-probe-<L>.spec.ts` (probes are excluded from the gate) that calls `page.screenshot({ path })` into `$TMPDIR`, then look at the image with `vision_analyze` if you have it. Judge it as a design reviewer: alignment, density, overflow, contrast, empty states. Delete or keep the probe, but never mention it as a feature.

## Design bar (the owner's)
Polished, self-explanatory, authentic to the domain, calm and dense like Linear/Notion/Obsidian/Codex, not a template. Keyboard reachable. Theme/accent must keep working (tokens only). Inspector is the single place for item detail (see P3): pages publish selections, they do not grow a second detail UI.

## Final report format (your last message; at most 350 words, no narration of the process)
1. Done: bullet per deliverable with file paths.
2. Proof: every command you ran with its exit code or pass/fail counts, and spec titles added.
3. Not done / partial: precise.
4. Requests to the parent: exact changes needed in serialised or peer files.
5. Risks you saw (flaky spec, perf, a11y).
Do not claim anything you did not run. "Typecheck passes" means you saw it exit 0 in this session.
