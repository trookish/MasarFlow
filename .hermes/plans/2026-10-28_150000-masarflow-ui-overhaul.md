# MasarFlow UI Overhaul — Unified Plan

> **For Hermes:** execute with `subagent-driven-development`. Subagents may edit `src` only for the phase they own (see §8), never commit; the parent commits with `git commit -m msg -- <paths>`.
> **Status:** plan only. Nothing here is implemented. Branch `overhaul/v0.3`.

**Goal.** Turn MasarFlow from "a set of pages" into one desktop harness that anyone can pick up: a consistent shell, one working inspector, interactive pages (graph, canvas, architecture) at the level of Obsidian/Figma, and an **AI** surface that behaves like Hermes / Codex / Claude Code. Fix three reported defects on the way: gradient logo, duplicate tabs, unusable inspector.

**Constraints that apply to every task** (from `AGENTS.md` and prior work): desktop-only; every new feature adds its title to `tests/e2e/feature-matrix.json` in the same commit as its packaged spec (`<route>: <feature>`); no text under 12px; `ConfirmDialog` not `confirm()`; `cn` from `@/lib/utils/cn`; CRLF files stay CRLF; prettier only on new files; `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION MASARFLOW_DATA_DIR` before builds; build into `desktop/dist-e2e`, never touch the user's running exe; Next.js here has breaking changes — read `node_modules/next/dist/docs/` before touching routing or metadata.

Terms this plan coins:
- **Page Shell** — one shared set of components (`PageHeader`, `Toolbar`, `EmptyState`, `Panel`, `SplitPane`) every page is built from, so spacing, headings and empty states are identical everywhere.
- **Archetype** — one of five page layouts (List-Detail, Board, Document, Canvas, Dashboard). Each page picks one; the archetype decides default inspector behaviour.
- **Inspector provider** — a small function a page registers that tells the inspector what the current selection is and what to show, replacing today's URL-only lookup.
- **Screenshot sweep** — a Playwright script that opens every route in the packaged app at 3 window sizes × 2 themes and saves PNGs for image review.

---

## 1. What I verified in the code (evidence)

| Request | Finding | Evidence |
|---|---|---|
| Logo gradient | The logo reads only the **solid** `accentColor`. The tint (CSS mask) uses `backgroundColor: accentColor`; the plate uses `background = accentColor`. It never reads `accentMode`, `gradientStops` or `gradientAngle`. | `src/components/shell/logo.tsx:20-60`; gradient helpers already exist: `gradientCss()` `src/lib/stores/theme.ts:67`, `AccentIconGradient` `src/components/shell/accent-icon-gradient.tsx` |
| Duplicate tab | Tab identity is the page **path** (`pageIdOf` strips the query) and `applyUrlFocus` → `openPanel` focuses an existing tab, so the store itself dedupes. Two things still read as "a duplicate": (a) the tab strip shows **Today**, and directly under it `SurfaceView` renders a second header **Today** + description + a section tab "Focus"; (b) route aliases that are different paths (`/brain` vs `/capture`, `/knowledge` vs `/brain/graph`, `/dashboard` vs `/today`) can each hold a tab. Root cause is **not yet reproduced** — see task 1.2. | `src/lib/stores/dock.ts:109`, `src/lib/dock/dock-core.ts:97-115`, `src/components/shell/surface-view.tsx:25-45`, `src/lib/navigation/workspace-tabs.ts:50-60` |
| Inspector | Fixed `w-80`, and `hidden … xl:block` → **absent below 1280px**, and on boards/canvas it permanently takes 320px. Its only input is the focused tab's URL query (`task=…`, `note=…`). Kinds registered with `param: null` — **commit, memory, archNode** — can never be selected. Graph nodes, canvas nodes, git files, settings, terminal, logs have no selection at all, so they fall through to a generic hint. | `src/app/(workspace)/layout.tsx:183`, `src/lib/entities/registry.ts:45-58`, `src/components/entity/inspector.tsx:119-148, 543-585`, `src/lib/ui/viewport.ts` |
| Rename Ask → AI | `ask` is a surface id, a route (`/ask`), a persisted tab id (`masarflow-dock-v1`), an entity-registry route (agent, thread), a mention route, a command, and appears in ~20 test files and 2 feature-matrix entries. | `rg "/ask"`: surfaces.ts, entities/registry.ts, chat/mentions.ts, commands/registry.ts, dock/panel-loader.tsx, inspector.tsx, dock.test.ts, workspace-tabs.test.ts, inspector.test.tsx, tabs.spec.ts, studio-chat.spec.ts, surfaces.spec.ts, feature-matrix.json |
| Page weight | `chat-view.tsx` 2 612 lines, `settings-view.tsx` 2 268, `sync-view.tsx` 1 067, `canvas-board.tsx` 1 335, `dashboard-view.tsx` 733, `agents-view.tsx` 714, `workflow-view.tsx` 669, `knowledge-graph.tsx` 558. Overhauling these without splitting them first is high-risk. | `wc -l` |

**Not verified:** how each page *looks*. I have read code, not rendered pages, so the per-page defect lists in §6 are a design brief, not a bug inventory. Phase 0 produces the real inventory.

## 2. Inventory — every page that exists

6 surfaces, 33 route pages (32 distinct views; `/brain/graph` is an alias of `/knowledge`), plus shell UI that is not a route.

| Surface | Section (route) | Main component(s) | Lines | Archetype |
|---|---|---|---|---|
| **Today** `/today` | Focus `/today` | `today/today-view`, `today-inbox`, `today-task-list`, `today-git` | 126 + 3 | Dashboard |
| | Dashboard `/dashboard` | `dashboard/dashboard-view`, `commits-panel` | 733 + 182 | Dashboard |
| **Capture** `/capture` | Notes `/brain` | `brain/notes-view`, `note-list`, `folder-tree`, `note-editor`, `rich-markdown-editor`, `backlinks-panel`, `note-detail-panel` | 283 … 354 | List-Detail + Document |
| | Canvas `/brain/canvas` | `canvas/canvas-board`, `canvas-toolbar`, `canvas-context-menu`, `canvas/nodes/*` | 1 335 + 307 + 238 | Canvas |
| | Templates `/brain/templates` | `brain/templates-manager`, `template-picker` | 297 | List-Detail |
| | Files `/files` | `files/files-view` | 107 | List-Detail |
| **Work** `/work` | Task Boards `/tasks` | `tasks/tasks-view`, `task-board`, `task-detail` | 205 + 154 + 335 | Board |
| | Specifications `/specs` | `specs/specs-view`, `spec-editor` | 189 + 373 | List-Detail + Document |
| | Sprints `/sprints` | `sprints/sprints-view` | 315 | Board / timeline |
| | Dev Logs `/devlogs` | `devlogs/devlogs-view` | 379 | List-Detail |
| **Library** `/library` | Documentation `/docs` | `docs/docs-view`, `doc-editor` | 201 + 175 | List-Detail + Document |
| | Standards `/standards` | `standards/standards-view`, `standard-editor`, `enforcer-panel` | 212 + 293 + 148 | List-Detail |
| | Architecture `/architecture` | `architecture/architecture-view`, `architecture-diagram`, `system-editor` | 174 + 250 + 253 | Canvas |
| | Knowledge Graph `/knowledge` (`/brain/graph`) | `brain/knowledge-graph` | 558 | Canvas |
| | Semantic Search `/search` | `search/search-view` | 432 | List-Detail |
| **Ask → AI** `/ask` → `/ai` | Chat `/chat` | `chat/chat-view`, `connections-dialog`, `model-picker`, `mention-menu`, `linked-projects-dialog`, `ai/approval-card` | 2 612 + 667 + 269 + 365 + 263 | Session |
| | AI Agents `/agents` | `agents/agents-view` | 714 | List-Detail |
| | AI Workflow `/workflow` | `workflow/workflow-view` | 669 | Canvas / list |
| **System** `/system` | Settings `/settings` | `settings/settings-view` (≈26 sub-sections), `data-backup-card`, `semantic-index-card` | 2 268 | Settings |
| | Control Center `/control-center` | `control-center/control-center-view`, `update-panel` | 266 | Dashboard |
| | Git `/git` | `git/*` (8 files) | ≈1 000 | Dashboard / List-Detail |
| | Sync Panel `/sync` | `sync/sync-view` | 1 067 | List-Detail |
| | Project Watcher `/watcher` | `watcher/watcher-view` | 383 | List-Detail |
| | Features `/plugins` | `plugins/plugins-view`, `plugin-settings-dialog` | 337 + 125 | List-Detail |
| | Terminal `/tools/terminal` | `tools/terminal-panel` | 325 | Terminal |
| | Logs `/tools/logs` | `tools/logs-panel` | — | Terminal / List |
| | System Info `/tools/system` | `tools/system-panel` | 270 | Dashboard |

Shell UI (not routes, also in scope): workspace tab strip, surface sidebar/dock, topbar, project switcher + new/remove project dialogs, command palette, global search, shortcuts dialog, update dialog, first-run setup wizard, db-gate/recovery screen, toasts, window controls, vault panel, entity chips/backlinks.

## 3. Decisions (alternatives rejected)

| # | Decision | Rejected alternative and why |
|---|---|---|
| D1 | Rename the surface route `/ask` → `/ai`; surface id `ai`, label **AI**, icon **`Sparkles`**. Keep the three section routes (`/chat`, `/agents`, `/workflow`) so their tests, mentions and entity kinds don't move. `/ask` becomes a legacy redirect and persisted tab ids are migrated. | Keeping `/ask` and changing only the label: leaves "Ask" in URLs, palette and test titles — the half-rename the user is trying to avoid. Renaming all four routes: ~2× the blast radius for no visible gain. |
| D2 | Section labels follow harness vocabulary: Chat → **Sessions**, AI Agents → **Agents**, AI Workflow → **Automations**. Labels only; routes stay. | "Threads" (Codex) vs "Sessions" (Claude Code, Hermes): "Sessions" is used by two of the three harnesses the user named. Open question Q1. |
| D3 | The inspector gets **two** sources of truth: URL selection (persists, deep-links) and an in-memory `inspectorTarget` that pages publish to (graph node, canvas node, commit, file). | URL-only (today): cannot express non-entity selections and spams history/tab snapshots. Memory-only: loses selection on reload and tab switch. |
| D4 | Inspector presentation is responsive: docked & resizable when the content area ≥ 1 100px; **overlay sheet** below that or when the page archetype is Board/Canvas and the user has not pinned it. | Always docked (today): boards and canvases lose 320px. Always overlay: wastes wide screens. |
| D5 | Gradient logo = gradient on **both** plate and mark. When mark and plate are both "accent", the mark uses the same gradient **reversed (angle + 180°)** so it stays legible. | Identical gradient on both: the mark disappears (this already happens with solid accent on solid accent — to be confirmed in task 1.1). |
| D6 | Build the Page Shell first, then migrate pages onto it in waves. | Restyling 33 pages independently: guarantees the inconsistency the user is complaining about. |
| D7 | Split the 2 000+ line components (`chat-view`, `settings-view`) *before* redesigning them, behaviour-preserving, under the existing E2E specs. | Redesign in place: unreviewable diffs, no safe rollback. |

## 4. Phase map

| Phase | Name | Depends on | Size | Gate |
|---|---|---|---|---|
| P0 | Baseline: screenshot sweep + vision review + inspiration board | — | S | defect list per page committed to `reports/ui-audit/` |
| P1 | Reported defects: 1.1 gradient logo, 1.2 duplicate tab, 1.3 Ask → AI | P0 (for 1.2 repro) | M | specs green |
| P2 | Page Shell + design tokens | P0 | M | shell unit tests + sweep diff |
| P3 | Inspector rebuild | P2 | L | every route has a defined inspector state |
| P4 | Page waves A–E (list in §6) | P2, P3 | XL | per-wave gate |
| P5 | Interactive pages (graph, canvas, architecture) | P2, P3 | XL | per-page gate |
| P6 | AI surface (Sessions, Agents, Automations) | P1.3, P2, P3 | XL | per-page gate |
| P7 | Polish, a11y, docs, release | all | M | full gate §9 |

**Status (2026-10-31).** Done and gated in the packaged app: P1, P2, the P6 rename slice (`/ask` → `/ai` with a server redirect and stored-tab migration, Sparkles icon, Sessions/Agents/Automations section titles), the archetype-driven Inspector default (board and canvas pages float it), pinned tabs and unsaved-changes dots on the tab strip. The flaky `Ctrl+Shift+T reopens the last closed tab` spec was a real race, now fixed: a section switch pushes a URL, and when Ctrl+W landed in the few milliseconds before the URL-sync effect ran, the sync treated the pending URL as a new visit and reopened the tab. `use-dock-sync.ts` now ignores a URL whose page was closed since the previous pass, and ignores the echo of its own mirror. Covered by `/work: Ctrl+W in the same tick as a section switch still closes the tab`, which failed 10/10 without the guard and passes 10/10 with it. Still open: P3 remainder, P4 waves A–E, P5 interactive pages, P6 beyond the rename (session list, agent cards, automation builder), P7.

**Parallelism.** After P2: P3 first (it changes the layout frame every page sits in). Then P4 waves, P5 and P6 can run concurrently *except* the files in §8, which have a single owner.

## 5. Phases 0–3 in detail

### P0 — Baseline and research

- **0.1 Screenshot sweep.** New `tests/e2e/desktop/zz-probe-ui-sweep.spec.ts` (name matches the existing `zz-probe` exclusion in the grep-invert, so it never runs in the gate). For each of the 33 routes: `launchApp({seed:"project"})` with realistic seed data (tasks across all statuses, 30+ notes with links, a canvas with all node types, an architecture with systems, a long chat), screenshot at 1280×800, 1600×900 and 1920×1080, in dark and light (and gradient accent once). Output `reports/ui-audit/<route>-<w>-<theme>.png`. `reports/` stays out of commits.
- **0.2 Vision review.** Run `vision_analyze` per image with a fixed rubric: alignment, spacing rhythm, truncated or overlapping text, text < 12px, contrast, empty-state quality, dead space, wrong scroll container, controls without labels, inconsistent headers. Output one `reports/ui-audit/findings.md` with severity per page. This list *replaces* the guesses in §6.
- **0.3 Reproduce the duplicate tab and the unusable inspector** with a scripted trace (click each tab from every other tab; select an item on Tasks/Graph/Canvas/Architecture at 1280 and 1920 wide). Record a screenshot of each failure.
- **0.4 Inspiration board.** `reports/ui-audit/inspiration.md` with one-line takeaways and links, already sourced:
  - Linear UI redesign — reduced visual noise, consistent alignment, higher density, side panels for meta properties: https://linear.app/now/how-we-redesigned-the-linear-ui
  - Notion layouts — pinned properties under the title, grouped properties, optional right panel: https://www.simonesmerilli.com/writing/notion-layouts
  - Claude Code desktop — sessions sidebar with status filter, parallel sessions, side chat, Verbose/Normal/Summary view modes, drag-and-drop panes: https://code.claude.com/docs/en/desktop and https://claude.com/resources/articles/claude-code-desktop-redesign
  - Codex desktop — sidebar = *where*, centre = *work*, right panel = *results* (diff, terminal, preview); Projects vs Chats; mode / model / permission selectors under the input: https://coding.flowo.design/en/codex/07-desktop-app
  - Seven-slot shell pattern (header, rail, panel, content, inspector, bottom) with fixed/overlay presentation per breakpoint: https://www.designsystemscollective.com/component-shell-a-layout-engine-for-modern-apps-57e59d3f6951
  - Still to collect during P0 (Obsidian Canvas, Obsidian graph view, Excalidraw/tldraw, Figma properties panel, Hermes desktop): add links only after opening them.

### P1 — Reported defects

**1.1 Gradient logo (plate and mark).**
- Files: `src/components/shell/logo.tsx`; tests `tests/unit/components/shell/logo.test.tsx` (new), `tests/e2e/desktop/shell.spec.ts`; check `settings-view.tsx` logo preview (same component or a copy? grep `LogoColorMode`).
- Logic: read `accentMode`, `gradientStops`, `gradientAngle`. Plate `logoBgMode==="accent"` and gradient → `background: gradientCss(stops, angle)` (use `background`, not `backgroundColor`). Mark `logoColorMode==="accent"` and gradient → mask element gets `backgroundImage: gradientCss(stops, angle + 180 when plate is also accent, else angle)`; masks accept background images, so no SVG needed. Custom colors and "original" are unchanged.
- Check every other consumer of `accentColor` for brand surfaces: favicon/`public/logo.png` usage, window icon, update dialog, wizard, About.
- Tests: unit — solid mode unchanged (snapshot of style), gradient mode emits `linear-gradient(` on both layers, reversed angle when both are accent. E2E — set gradient accent + both logo options in Settings → Appearance, assert `computedStyle.backgroundImage` contains `linear-gradient` on the plate and on the mask child (`/system: gradient accent paints the logo plate and mark`).

**1.2 Duplicate tab.**
- Step 1 (reproduce, from P0.3): for each tab click, record tab count before/after, the URL, and the dock state (`localStorage["masarflow-dock-v1"]`). Decide between H1 (visual: strip label + `SurfaceView` header repeat) and H2 (real: alias paths or a `?view=` variant creating a second tab).
- Fix for H1: `SurfaceView` stops repeating the surface title and description (the tab strip already names the surface). Header becomes a slim section switcher only; description moves to a tooltip on the tab and to the empty state. Files: `surface-view.tsx`.
- Fix for H2: canonicalise tab identity in one place — `canonicalize()` in `src/lib/stores/dock.ts:82` and `resolveLegacyUrl` — so `/dashboard`, `/brain`, `/knowledge`, `/brain/graph` etc. resolve to their surface tab with `?view=`, and `normalizeWorkspaceTabs` merges any existing duplicates on load (persisted state already has them).
- Tests: unit — `open("/today")` twice and `open("/dashboard")` yield one tab; persisted duplicates merge. E2E — click every tab and every surface link from every tab; tab count never increases beyond the number of distinct surfaces (`/tabs: clicking a surface never opens a duplicate tab`). The flaky `Ctrl+Shift+T` test in `tabs.spec.ts` is re-examined here: its failure is likely the same identity race.

**1.3 Ask → AI.**
- `src/lib/navigation/surfaces.ts`: id `ai`, label `AI`, route `/ai`, icon `Sparkles` (confirm it exists in the installed lucide 1.31 before use), description "Sessions, agents and automations for the active project."; sections Sessions `/chat`, Agents `/agents`, Automations `/workflow` (D2).
- New route `src/app/(workspace)/ai/page.tsx`; delete `ask/page.tsx`; `ALIASES`/`redirects.ts`: `/ask` → `/ai`, with `view` preserved; `normalizeWorkspaceTabs` already canonicalises via `resolveLegacyUrl`, so persisted tabs migrate.
- Update: `panel-loader.tsx`, `entities/registry.ts` (agent, thread routes), `chat/mentions.ts`, `commands/registry.ts` ("Go to AI"), `inspector.tsx`, `dashboard-view.tsx` links, `run-agent-turn.ts`/`catalog.ts` copy, `settings-view.tsx` section labels (Chat → Sessions, AI Agents → Agents, AI Workflow → Automations).
- Tests: rename in `dock.test.ts`, `workspace-tabs.test.ts`, `surfaces.test.ts`, `registry.test.ts`, `inspector.test.tsx`; E2E `tabs.spec.ts`, `studio-chat.spec.ts`, `surfaces.spec.ts`, `voice.spec.ts`, `journey.spec.ts`, `audit-a11y.spec.ts`, `_harness.ts`; **feature-matrix titles** `/ask:` → `/ai:` in both the JSON and the spec titles in the same commit (matrix guard). New test: legacy `/ask?view=agents` redirects to `/ai?view=agents`, and a stored `/ask` tab becomes `/ai`.
- A grep gate: `rg '"/ask"|/ask\b' src tests` returns only the redirect and its test.

### P2 — Page Shell and tokens

- New `src/components/page/`: `PageHeader` (title, subtitle, primary action, secondary actions, optional breadcrumb), `Toolbar` (search, filters, view switcher, sort, density), `Panel`, `SplitPane` (persisted widths, keyboard-resizable), `EmptyState` (icon, one sentence, primary action, optional "learn" link), `Skeleton` set, `KeyHint`.
- Tokens in `globals.css`: spacing scale, row heights (compact 28 / comfortable 36), type scale with 12px floor, radius, elevation, focus ring; all colours from theme variables so light/dark/AMOLED/gradient all work. Gradient accent applies to: primary buttons, active tab underline, focus ring, selection chips, progress bars (via `bg-primary`, already gradient-aware) — not to body text.
- Density setting (Compact / Comfortable) in Settings → Interface, consumed by every Toolbar/list row (a setting must be consumed outside the settings screen — repo-truth guard).
- Archetype wrappers: `ListDetailLayout`, `BoardLayout`, `DocumentLayout`, `CanvasLayout`, `DashboardLayout`, `SessionLayout`; each declares `inspector: "docked" | "overlay" | "off"` default.
- Shell polish: tab strip (drag reorder, overflow menu, middle-click, pinned tabs, per-tab dirty dot), topbar (breadcrumb of surface › section › item, project switcher, command palette hint), status bar at the bottom (branch, sync state, AI model/context usage, background jobs) à la Codex/Claude Code.
- Tests: unit per component; E2E `shell.spec.ts` additions; sweep re-run diff.

### P2 — status: DONE (2026-10-29)

Built: `src/components/page/` (`PageFrame`/`PageBody`/`PageStage` with `data-archetype`, `PageHeader`,
`Toolbar` family, `Panel` family, `SplitPane` with persisted + keyboard-resizable widths, `EmptyState`
(now the single implementation, re-exported from `ui/empty-state`), `Skeleton` set, `KeyHint`);
tokens in `globals.css` (`--row-h` 36/28 by `[data-density]`, chrome heights, gutters);
`src/lib/ui/{density,pane-width,relative-time}.ts`; density in Settings → Interface, applied on the
app frame and consumed by setting rows (repo-truth guard satisfied);
`StatusBar` (selection, branch, last sync) as the layout's last row; Task Boards migrated onto the shell.
Tests: `tests/unit/lib/ui/page-shell.test.ts` (10) + `tests/e2e/desktop/shell-page.spec.ts` (2, matrix entries added).
Also fixed: the one sub-12px label in the app (graph edge labels), now guarded by a source scan.

Deferred to P4 (with the page migration): per-archetype Inspector default (today `presentation.ts`
`FLOATING_SECTIONS` still encodes it), tab-strip pinned tabs and per-tab dirty dot.

### P3 — Inspector rebuild

**Architecture.**
- `src/lib/inspector/` (new): `types.ts` (`InspectorTarget = {kind, id, source}`), `store.ts` (`inspectorTarget`, `pinned`, `width`, `mode`; width and pin persisted), `providers.ts` (registry: `registerInspector(kind, {read, fields, actions, links})`), `use-inspect.ts` (`useInspectOnSelect(ref)` for pages).
- `entity/inspector.tsx` (652 lines) is split into `InspectorFrame` (presentation: docked/overlay/resizer), `InspectorHeader`, `PropertyList` (inline-editable), `LinksSection`, `ActivitySection`, `ActionsBar`, and per-kind providers under `src/lib/inspector/providers/`.
- Presentation (D4): docked and resizable 280–480px, double-click handle resets; overlay sheet with scrim and `Esc` when the content area is narrow or the archetype is Board/Canvas; open/close with a topbar button and a shortcut (check `shortcuts-dialog.tsx` for collisions before choosing). Never hidden by breakpoint alone: below 1 100px it becomes the overlay instead of vanishing.
- Selection sources: pages call `inspect({kind,id})` on click/focus (cards, rows, graph nodes, canvas nodes, architecture nodes, commits, files, log lines). Deep-linkable kinds also write their URL param.
- Content per target: title (inline-editable), properties (status, priority, assignee, due, tags, linked sprint/spec), relations (backlinks, linked entities with chips), activity (created/updated, history), actions (open in tab, copy link, ask AI about this, duplicate, delete with `ConfirmDialog`). Edits are optimistic with undo toast (one write path through the existing repos).
- No-selection state is a real panel, not a hint: page summary (counts, health), quick actions of the page, and the three most recent items.

**Per-page contract (all 33 routes).** A table in `src/lib/inspector/coverage.ts` maps each route to `selectable kinds` or `"summary only"`, and a unit test fails if a registered page has neither. Examples: `/tasks` → task; `/brain` → note; `/brain/canvas` → canvas, canvas node (text/note/web/media/group); `/architecture` → system, archNode; `/knowledge` → note, doc, spec, task (graph node); `/git` → commit, file, branch; `/files` → file; `/chat` → thread, message; `/agents` → agent, run; `/workflow` → automation, step; `/settings`, `/tools/*`, `/sync`, `/watcher`, `/plugins`, `/control-center` → summary only with page-specific quick actions.

**Fixes for the known breakage.** Boards: selecting a card opens the overlay sheet without shifting columns; drag-and-drop is unaffected (pointer events on the sheet scrim are blocked only when open). Registry: give `commit`, `memory`, `archNode` a selection mechanism (in-memory target now; add URL params `commit=`, `node=` so they deep-link).

**Tests.** Unit: provider registry parity (every `ENTITY_KINDS` entry has a provider; extend `kinds-parity.test.ts`), coverage map completeness, store persistence. E2E (`tests/e2e/desktop/inspector.spec.ts`, new): select-and-edit a task on the board at 1280 and 1920 width; graph node; canvas node; architecture node; commit; resize persists after reload; overlay `Esc`; no-selection panel on every route renders non-empty (loop over the coverage map). Matrix entries added for each.

## 6. Page-by-page overhaul brief (P4, P5, P6)

Each entry: the redesign, the Page Shell archetype, what P0 must confirm, and the spec to add. All pages also get: `PageHeader`, a proper empty state, loading skeleton, keyboard navigation, and inspector wiring from P3.

### Wave A — Today surface
- **Focus `/today`.** Make it a daily cockpit: greeting + date, "Now" (in-progress tasks), "Due" (overdue/today), "Inbox" (unprocessed captures), "Recent" (notes, commits), a one-field quick-capture (Enter creates a task or note, prefix `/note`). Remove the duplicate surface heading (1.2). Spec: `/today: quick capture creates a task`.
- **Dashboard `/dashboard`.** 733 lines → split into cards (project health, task burndown, sprint progress, activity, commits, knowledge growth). Customizable card order/visibility persisted; consistent card chrome; every card links into its page and registers inspector targets (commit/memory). Fix the `aria-required-children` a11y issue on `.items-end` while here.

### Wave B — Capture surface
- **Notes `/brain`.** Three-pane layout (folders/tags · note list · editor) with persisted pane widths; list rows show title, snippet, date, tags; sort/filter toolbar; editor gets a floating format bar, slash menu polish, properties header (tags, aliases, linked entities) à la Notion/Obsidian, backlinks and outline in the inspector instead of a separate right column; tabs/split inside Notes are out of scope.
- **Templates `/brain/templates`.** List + live preview, variable picker, "new note from template" action.
- **Files `/files`.** Tree + preview pane, file-type icons, search, open-in-editor/reveal-in-explorer actions, inspector shows size/modified/links.
- **Canvas** — see P5.

### Wave C — Work surface
- **Task Boards `/tasks`.** The page the user flagged. Board with swimlane/group-by (status, priority, sprint, assignee), WIP counts, quick-add per column, card density, drag with drop-position indicator, multi-select + bulk actions, filters bar, saved views, list/table view toggle. Card click → inspector overlay (P3) so columns never shift; `task-detail.tsx` (335 lines) becomes the inspector's task provider rather than a second UI.
- **Specifications `/specs`.** List-Detail with status chips (draft/review/approved), document editor with outline, linked tasks panel (progress roll-up), template picker.
- **Sprints `/sprints`.** Sprint header (goal, dates, capacity), burndown, task list by status, drag tasks between backlog and sprint, completed sprints collapsed.
- **Dev Logs `/devlogs`.** Timeline grouped by day, quick-entry box, tags, link to commits/tasks, filter by type.

### Wave D — Library and System utilities
- **Docs `/docs`, Standards `/standards`.** Same List-Detail + Document layout as Specs; standards get a compliance summary and `enforcer-panel` results as inline badges.
- **Semantic Search `/search`.** Search-first layout: large input, scope chips (notes, docs, specs, tasks), result cards with highlighted snippets and score, index status strip, inspector preview of the hit.
- **Settings `/settings`.** ≈26 sub-sections → searchable left nav in 5 groups (General, Appearance, Workspace, AI, Advanced), live preview for theme/accent/logo, each setting with a one-line description, reset-per-section. Split `settings-view.tsx` into one file per group (D7).
- **Control Center `/control-center`.** Health overview: app version/update, data location, storage, diagnostics export, status of Git/AI/Sync, with fix buttons rather than raw text.
- **Git `/git`.** Status, diff viewer (side-by-side), stage/commit box, branch menu, history graph, GitHub PR/issue panel; commit selection → inspector.
- **Sync `/sync` (1 067 lines).** Split; clear connection state, last sync, conflicts list with resolve actions, activity log.
- **Watcher `/watcher`.** Live event feed with filters and pause; watched folders list.
- **Features `/plugins`.** Card grid with enable switch, status and settings dialog; categories.
- **Terminal / Logs / System Info `/tools/*`.** Bottom-panel treatment: terminal tabs, search in scrollback, copy; logs with level filter and follow-tail; system info as grouped key-value cards with copy diagnostics.

### Wave E — Shell dialogs and first run
Setup wizard (progress steps, clear final screen), new/remove project dialogs, project switcher (recent, search, per-project icon/colour), command palette (grouped results, recent, AI actions), global search, shortcuts dialog (searchable), update dialog, db-recovery screen, toasts.

### P5 — Interactive pages (graph, canvas, architecture)

**Knowledge Graph `/knowledge` (`knowledge-graph.tsx`, 558 lines).**
- Rendering: move to a canvas/WebGL layer (or keep SVG with culling) with a force layout running in a worker; stable positions saved per project; smooth zoom/pan with minimap.
- Obsidian-style controls panel: filters (type, tag, folder, orphans), groups with colours, display (node size by links, labels on zoom, arrows), forces (centre, repel, link, distance) with sliders.
- Interaction: hover highlights neighbours and dims the rest, click selects (inspector), double-click opens, local graph mode (depth 1–3 around the selected note), search-to-focus, timeline/animate.
- Performance target: smooth at 2 000 nodes (measure in the sweep with a generated vault).

**Canvas `/brain/canvas` (`canvas-board.tsx`, 1 335 lines → split into `viewport`, `selection`, `connections`, `history`, `shortcuts`, `renderers`).**
- Infinite pan/zoom with minimap, snap and smart guides (existing `canvas-alignment.ts`), multi-select with marquee, group/ungroup, lock, z-order, align/distribute.
- Node types: text, note embed, web, media, group, plus shape/sticky/frame and drawing (pencil) as additions; edges with labels, arrow heads, routing styles; edge drag from any side handle.
- Left tool rail (select, hand, text, note, shape, connector, draw, image), floating property bar for the selection (colour, size, font), context menu, undo/redo with history, export PNG/SVG/JSON, "frame to presentation".
- Inspector: node and edge properties. Autosave indicator.

**Architecture `/architecture` (`architecture-diagram.tsx`, 250 lines).** Today it is the thinnest of the three.
- Real diagram editor: systems as nodes, typed relations (calls, reads, writes, owns), auto-layout (layered/force) with manual override, collapsible groups (layers/domains), zoom/pan/minimap, edge labels.
- Views: Diagram · Table · Dependency matrix; filter by layer/status/owner; "show impact" highlights everything depending on the selected node.
- Linking: system ↔ specs ↔ tasks ↔ notes through the entity chips; AI action "describe this architecture" / "check for cycles".
- Export Mermaid / PNG / SVG. Fix `archNode` selection (P3).

Shared for all three: one `useViewport` (pan/zoom) hook, one minimap component, one selection model, one export helper — put in `src/components/canvas-kit/` so the pages stop carrying private copies.
Specs: `/knowledge: local graph and filters`, `/brain/canvas: multi-select, align and undo`, `/architecture: relation editing and impact highlight`, plus performance specs tagged `@slow`.

### P6 — AI surface (Sessions, Agents, Automations)

Reference model: Codex (sidebar = where, centre = work, right = results; Local/Worktree/Cloud, model and permission selectors under the input), Claude Code desktop (sessions list with status filters and grouping, parallel sessions, side chat, Verbose/Normal/Summary view modes, usage meter), Hermes (sessions, tool calls, approvals).

- **Surface frame.** `/ai` gets its own left list (Sessions · Agents · Automations as the three top-level groups, with "New session" always on top, `Ctrl+N`), search, status badges (running, waiting for approval, done, failed), grouping by project. Centre is the active thing; right is the Inspector (P3) acting as the "results" panel: tool-call detail, files touched, diffs, linked entities, context/token usage.
- **Sessions (`chat-view.tsx`, 2 612 lines — split first, D7).** Transcript with grouped tool calls (collapsible, with a Verbose / Normal / Summary toggle), inline approval cards (existing `approval-card.tsx`), streaming with stop/retry/branch ("side chat" that does not pollute the main thread), composer with @-mentions of entities (existing `mention-menu`), attachments, slash commands, and a controls row: model picker, permission mode (ask / auto-edit / read-only), project scope (linked projects), context meter. Empty state: suggested prompts built from the project (open tasks, recent notes). Keyboard: `Ctrl+N` new, `Ctrl+Tab` next session, `Ctrl+/` shortcuts.
- **Agents (`agents-view.tsx`, 714).** Agent gallery → agent detail (role/instructions, model, tools & permissions, knowledge scope, schedule), run history with live status, "Run now", "Chat with agent" opening a session. Inspector shows the agent's config and last run.
- **Automations (`workflow-view.tsx`, 669).** Name matches Codex's term. Two views: List (trigger → steps summary, last/next run, enable switch) and Builder (node graph on the shared canvas-kit: trigger, AI step, tool step, condition, approval), run log with per-step output. Templates ("daily standup summary", "triage new tasks").
- **Settings alignment.** AI settings group (providers/connections, models, permission defaults, local AI service) moves to a single group matching these three pages.
- Specs: `/chat: grouped tool calls collapse and expand`, `/chat: side chat does not change the main thread`, `/agents: run now records a run`, `/workflow: automation builder saves and runs`. Keep the existing fallback / `/model` specs green.

## 7. Files per phase (single owner → see §8)

- P1: `src/components/shell/{logo,surface-view}.tsx`, `src/lib/navigation/{surfaces,redirects,workspace-tabs}.ts`, `src/lib/stores/dock.ts`, `src/app/(workspace)/ai/page.tsx` (new), listed rename sites, `tests/e2e/feature-matrix.json`.
- P2: `src/components/page/*` (new), `src/app/globals.css`, `src/components/shell/{topbar,workspace-tabs}.tsx`, new status bar.
- P3: `src/lib/inspector/*` (new), `src/components/entity/inspector.tsx` (split), `src/app/(workspace)/layout.tsx`, `src/lib/stores/ui.ts`, `src/lib/entities/registry.ts`.
- P4/P5/P6: the component folders listed in §2, each wave one owner.

## 8. Serialised files (one owner at a time)

`src/app/(workspace)/layout.tsx`, `src/lib/stores/ui.ts`, `src/lib/stores/dock.ts`, `src/lib/navigation/surfaces.ts`, `src/lib/entities/registry.ts`, `src/app/globals.css`, `tests/e2e/feature-matrix.json`, `tests/e2e/desktop/_harness.ts`. Rule: P1 owns them first, then P2, then P3; later phases request changes from the owner (the parent) instead of editing.

## 9. Release gate (every phase, then once at the end)

1. `pnpm run typecheck` and `pnpm run desktop:typecheck` — 0 errors.
2. `pnpm exec vitest run --config tests/vitest.config.ts --reporter=dot` — all pass (the four feature-truth guards included).
3. `pnpm run lint` — 0 errors, no new warnings.
4. Build into `dist-e2e` (command in the `masarflow` skill), then `pnpm exec playwright test --config tests/playwright.desktop.config.ts --grep-invert "@slow|harness:|zz-probe"` — all pass; new features have matrix entries and specs.
5. Screenshot sweep re-run; vision review shows no Severity-1 or -2 item left from P0.
6. Manual pass of the three reported defects on the packaged exe: gradient logo, tab click on every tab, inspector on Tasks/Graph/Canvas/Architecture at 1280 px.

## 10. Order and cut lines

Order: P0 → P1.1/1.2/1.3 → P2 → P3 → (P4 waves ∥ P5 ∥ P6) → P7.
If time runs out, cut in this order: Wave E dialogs polish → Wave D utilities (Sync, Watcher, Plugins) → canvas draw tool and presentation mode → Automations builder (keep list view) → graph worker layout.
**Never cut:** P1 (all three defects), P2, P3, Task Boards, Graph/Canvas/Architecture fixes, the AI surface rename and Sessions redesign.

## 11. Risks and open questions (default if unanswered)

- **Q1.** Section names: Sessions / Agents / Automations (D2). *Default: as listed.* Alternative: keep "Chat / Agents / Workflows".
- **Q2.** Icon for AI: `Sparkles` (generic, widely recognised). *Default: Sparkles.* `BrainCircuit` is already used in Settings for Brain, `Bot` for Agents, so those would collide.
- **Q3.** Both logo options on accent with a gradient: legibility rule D5 (reversed gradient on the mark). *Default: reversed.* If you want literally the same gradient on both, the mark is invisible.
- **Q4.** Duplicate tab: the code dedupes by path already, so I need to know whether you mean (a) a second tab appears in the strip, or (b) the page shows its name twice (strip + header). *Default: fix both (1.2).*
- **Risk — scope.** This is a multi-week redesign. P1 is a day; P2–P3 are the foundation; P4–P6 are where most of the time goes.
- **Risk — test churn.** The rename touches ~20 test files and the feature-matrix guard fails the build on any mismatch; do it in one commit.
- **Risk — splitting giant components** (`chat-view`, `settings-view`, `canvas-board`, `sync-view`) can regress behaviour; each split lands as its own behaviour-preserving commit with the existing specs green before any visual change.
- **Risk — graph/canvas performance.** Set explicit budgets in P0 (2 000 nodes graph, 500 nodes canvas at 60 fps) and fail the `@slow` specs if missed.
- **Not verified here:** rendered visuals of any page; whether Board cards already call the URL-selection path; which shortcuts are free for the inspector toggle; whether lucide 1.31 exports `Sparkles` (very likely, confirm in 1.3).

## 12. Handoffs

- P1.3 → P6: the `/ai` route and section labels exist.
- P2 → everything: the Page Shell components and archetype wrappers.
- P3 → P4/P5/P6: `registerInspector`, `useInspectOnSelect`, `coverage.ts` (each page adds its row in the same commit as its migration; the coverage unit test fails otherwise).
- P5 → P6: `canvas-kit` is reused by the Automations builder.
