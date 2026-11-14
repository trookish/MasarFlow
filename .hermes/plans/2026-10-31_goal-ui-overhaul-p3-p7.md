# Goal file: finish the MasarFlow UI overhaul (P3 remainder, P4, P5, P6 remainder, P7)

Branch `overhaul/v0.3`. Plan of record: `.hermes/plans/2026-10-28_150000-masarflow-ui-overhaul.md` (P3 at section 5, waves A-E and P5/P6 at section 6, gate at section 9, cut lines at section 10). Also read `AGENTS.md` and the `masarflow` skill (`references/e2e-testing.md`) before touching specs.

Baseline on 2026-10-31: P1, P2, the `/ai` rename, archetype Inspector default, pinned tabs, unsaved dots all gated. Packaged gate 92 passed, 1349 unit tests, typecheck and lint clean.

## Rules that never relax
- No commit, push, amend, stash, reset, rebase or branch switch. Commit approval is the owner's.
- Never edit `.env*`, never stage `reports/`, never close or overwrite `desktop/dist/win-unpacked`. Build into `desktop/dist-e2e`.
- Do not skip, delete, xfail or weaken any test, spec, feature-matrix entry or guard. A page keeps every feature it has today.
- Every new feature: a packaged spec titled `<route>: <feature>` AND the same title in `tests/e2e/feature-matrix.json` (one-line arrays, CRLF) in the same change.
- No text under 12px. Formal professional copy, no emoji. `ConfirmDialog` for confirmations, `cn` from `@/lib/utils/cn`.
- Serialised files (`layout.tsx`, `stores/ui.ts`, `stores/dock.ts`, `navigation/surfaces.ts`, `entities/registry.ts`, `globals.css`, `feature-matrix.json`, `_harness.ts`) have one editor at a time.
- Each split of a giant component (`chat-view`, `settings-view`, `canvas-board`, `sync-view`) lands behaviour-preserving, existing specs green, before any visual change.
- If the plan's cut lines (section 10) must be used, tell the owner which item and why BEFORE cutting. "Never cut" items: Task Boards, graph/canvas/architecture fixes, the Sessions redesign.

## Commands (run each, show its output)
```
unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION MASARFLOW_DATA_DIR
pnpm run typecheck && pnpm run desktop:typecheck && pnpm run lint
pnpm exec vitest run --config tests/vitest.config.ts --reporter=dot
(pnpm build:app && cd desktop && pnpm exec electron-vite build && pnpm exec electron-builder --win --dir -c.directories.output=dist-e2e)
export MASARFLOW_E2E_APP_DIR=C:/Users/trookish/Dev/Web-Projects/MasarFlow/desktop/dist-e2e/win-unpacked
pnpm exec playwright test --config tests/playwright.desktop.config.ts --grep-invert "@slow|harness:|zz-probe" --reporter=line
```
After stale route types: `rm -rf .next/types .next/dev/types`. Run builds in the background and wait; keep waits at 410 s or less; no heavy parallel jobs during e2e.

## Checklist (tick only with the test, file or command output that proves it)
### P3 Inspector rebuild
- [ ] `src/lib/inspector/` has `types`, `store`, `providers` (`registerInspector`), `use-inspect` (`useInspectOnSelect`), `coverage.ts`; `components/entity/inspector.tsx` split into frame, header, property list, links, activity, actions.
- [ ] Unit: every `page.tsx` under `src/app/(workspace)` has a coverage row (selectable kinds or summary only); every `ENTITY_KINDS` entry has a provider (extend `kinds-parity.test.ts`); store persists width and pin.
- [ ] `commit`, `memory`, `archNode` are selectable and deep-link (`commit=`, `node=`).
- [ ] Packaged spec(s): task select-and-edit on the board at 1280 and 1920 width without shifting columns; graph, canvas and architecture node; commit; resize persists after reload; `Esc` closes the overlay; no-selection panel is non-empty on every route (loop over the coverage map).
### P4 page migration (plan section 6, waves A-E)
- [ ] A: Today cockpit with quick capture, Dashboard split into persisted cards. Spec `/today: quick capture creates a task`.
- [ ] B: Notes three-pane, Templates, Files tree and preview.
- [ ] C: Task Boards (group-by, WIP, quick-add, bulk actions, saved views, list toggle, card opens inspector overlay), Specs, Sprints, Dev Logs.
- [ ] D: Docs, Standards, Search, Settings (searchable, 5 groups, one file per group), Control Center, Git, Sync, Watcher, Features, Tools.
- [ ] E: setup wizard, project dialogs and switcher, command palette, shortcuts dialog, update dialog, db-recovery, toasts.
- [ ] Guard: a repo-truth unit test lists every workspace page view and requires Page Shell use, allow-list EMPTY; each page's coverage row lands with its migration.
### P5 interactive pages
- [ ] `src/components/canvas-kit/` (viewport hook, minimap, selection model, export helper) imported by `knowledge-graph`, `canvas-board` and `architecture-diagram`; no private copies left.
- [ ] Specs: `/knowledge: local graph and filters`, `/brain/canvas: multi-select, align and undo`, `/architecture: relation editing and impact highlight`; `@slow` budgets 2 000-node graph and 500-node canvas.
### P6 AI surface (rename already done)
- [ ] `chat-view` split first; Sessions list with status badges and search; Agents gallery and detail; Automations list and builder on canvas-kit.
- [ ] Specs: `/chat: grouped tool calls collapse and expand`, `/chat: side chat does not change the main thread`, `/agents: run now records a run`, `/workflow: automation builder saves and runs`. Fallback and `/model` specs stay green.
### P7 polish, accessibility, docs
- [ ] axe/a11y specs clean; screenshot sweep re-run with no severity 1 or 2 item left.
- [ ] README, CHANGELOG and docs state only behaviour that exists (check each claim against code).
- [ ] Plan file status block updated for every phase.
### Final gate
- [ ] typecheck, desktop:typecheck, lint exit 0; full vitest green; packaged playwright gate green with more than 92 passed and every title above present.
- [ ] Final report: what changed per phase, proof lines, what is not done, and an explicit answer to "are you finished?".

## Progress log (append one line per finished item: date, item, proof)
- 2026-10-31 Safety snapshot of the uncommitted tree (tracked.patch 3.2M, untracked.tar 190K) in `%LOCALAPPDATA%/hermes/cache/scratch/snap/`. Proof: `ls` of that folder.
- 2026-10-31 Page Shell adoption guard `tests/unit/repo-truth/page-shell-adoption.test.ts` added with a shrinking allow-list of the 26 routes not yet on the shell (must end empty). Proof: vitest, 2 passed.
- 2026-10-31 Agent tooling `.hermes/tools/build-e2e.mjs` (locked per-stream build into dist-e2e) and `.hermes/tools/matrix-add.mjs` (locked matrix writer). Proof: `node.exe --check` clean; matrix key order and compact format round-trip verified.
- 2026-10-31 Wave 1 dispatched: stream A (P3 Inspector), stream B (canvas-kit + Knowledge Graph), stream C (chat-view split, grouped tool calls, side chat). Briefs: `.hermes/tasks/v4-*.md`. Note: I overwrote the tracked `v3-00-shared-context.md` by mistake and restored it byte-for-byte from HEAD (`git diff --stat -- .hermes/tasks` is empty); the new shared context is `v4-00-shared-context.md`.
