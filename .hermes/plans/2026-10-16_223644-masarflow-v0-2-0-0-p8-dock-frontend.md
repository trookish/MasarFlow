# MasarFlow v0.2.0.0 — P8: Dock completion, tool panels, Today view, palette v2

> **For Hermes:** execute with `subagent-driven-development`, one task at a time. Read the master plan (`…-master.md`) §1 (verified facts), §2 (fake/broken inventory), §4 (D1, D3, D10, D11) and §6 (conventions) before starting.
> **Depends on:** **P1** (desktop shell: `desktop/src/shared/{channels,api,security}.ts`, `window.masarflow`, `src/lib/desktop/bridge.ts:getDesktop()`, `desktop/src/main/ipc/index.ts:registerIpc`), **P2** (`roots.json` allow-list: `@desktop-shared/roots` `isRootAllowed`/`normalizeRoot`, `CH.rootsList`, `CH.rootsCovers`, `addRootToFile`), **P5** (`src/lib/entities/registry.ts`, `src/lib/entities/open.ts:openEntity`, `src/components/entities/entity-chip.tsx`, `src/lib/activity/*` + the `activity` table), **P4** (Dexie ≥ 11; P8 adds only a *non-indexed* task field — no version bump). **Consumes (does not implement):** P6 git status (T19), P7 daily notes (T18, T21).
> **Branch:** `release/v0.2.0`. Every command below is run from the repo root (`C:/Users/trookish/Dev/Web-Projects/MasarFlow`) in git-bash.

**Goal:** Make the dock a complete, predictable window manager (real persisted-layout migrations, safe drag/drop, keyboard-first operation, per-project layouts with undo), fill the three holes the retired launcher left (terminal, logs, system info — each a dock panel, not a separate app), add a Today view that answers "what do I do now", and turn the command palette into the one door into everything — all without breaking the P1/P2 gate or the P5 entity language.

**Architecture in one paragraph.** The dock already *is* the app shell: panel ids are route paths, `src/components/dock/panel-loader.tsx` maps path → the real route component via `next/dynamic`, and the 22 workspace routes render inside dock panels or classic routing depending on `useUIStore.dockEnabled`. P8 therefore never redesigns the dock: it (a) finishes the pure layers that were left as TODOs (`serde.migrate`, drop validation, overflow/geometry helpers), (b) adds **three new dock pages** (`/tools/terminal`, `/tools/logs`, `/tools/system`) that are ordinary `src/app/(workspace)/tools/*/page.tsx` routes, so they get the dock's keep-alive, drag/drop, tab and persistence behaviour for free, and (c) adds **one new workspace route** (`/today`) plus a *v2 palette* that reads the P5 entity registry and the P5 activity table. Anything that needs the machine (shell, log files, paths) crosses the P1 preload bridge to the main process; nothing else does.

## Verified context (read in this repo on 2026-10-16, pre-P8 state)

| # | Fact | Evidence (`file:line`) |
|---|---|---|
| V1 | `serde.ts` carries an unimplemented migration hook: `migrate()` returns its input and a `TODO(dock)` comment sits right below it. `parseProjectState` validates *without* calling it. | `src/lib/dock/serde.ts:49` (`version: z.literal(1)`), `:59-62`, `:64-71` |
| V2 | `ProjectDockState.version` is the literal `1`; `defaultProjectState()` writes `version: 1`. Persisted store key is `masarflow-dock-v1` and the rehydrate `merge` calls `parseProjectState` per project, silently dropping anything invalid. | `src/lib/dock/types.ts:39`, `src/lib/dock/presets.ts:76-91`, `src/lib/stores/dock.ts:335-367` |
| V3 | Test fixtures hard-code `version: 1` and a `tsc --noEmit` run type-checks `tests/**` (`include: ["next-env.d.ts","**/*.ts",…]`, only `node_modules`/`desktop` excluded) — so a version bump is a compile-time-visible change. | `tests/unit/lib/dock/serde.test.ts:27,154,160`, `tests/unit/lib/dock/dock-core.test.ts:50`, `tsconfig.json:32-43` |
| V4 | The dock store exposes `open/close/focus/insert/move/reorder/resize/float/dockFloater/moveFloater/resizeFloater/focusFloater/toggleFloaterMinimized/toggleFloaterMaximized/toggleCollapse/toggleMaximize/setWorkspace/saveWorkspaceAs/resetWorkspace/setDrag` (+`getProject/setProject`) — **no** `undo`, **no** `deleteWorkspace`, **no** layout import/export. | `src/lib/stores/dock.ts:86-123` |
| V5 | `close` = `closeEverywhere(state, panelId)` with no history and no feedback; `resetWorkspace` replaces the live tree with `WORKSPACE_PRESETS[activeWorkspace]` and clears params, also without history. | `src/lib/stores/dock.ts:175-176,321-330`, `src/lib/dock/dock-core.ts:347-382,461-466` |
| V6 | `movePanel` removes the source **first**, then looks the target up; a stale target falls back to a **root** insert, a `split` target returns the tree *without* re-inserting the payload, and an edge drop on the dragged group itself lands in that same fallback (position loss). | `src/lib/dock/tree.ts:309-405` (`:353-356`, `:390`) |
| V7 | Only leaf groups are drop targets: `data-dock-node` is set **only** by `dock-group.tsx`; splitters and split wrappers are not targets. The hit-test picks the most specific hit (zone `"tab"` breaks the loop). | `src/components/dock/dock-group.tsx:67`, `src/components/dock/dock-workspace.tsx:71-88` |
| V8 | Drag commit happens in `use-dock-dnd.tsx` on pointerup with **no validation**: `move(panelId, targetId, zone)` for panels/groups, `dockFloater` for floaters, and *any* release over free space **floats** the panel. `DockDragState` is transient (`{source, pointer, zone, targetId}`). | `src/components/dock/use-dock-dnd.tsx:51-113`, `src/lib/stores/dock.ts:62-76` |
| V9 | The tab strip is `role="tablist"` with roving `tabIndex` but **no** keyboard handler, `max-w-44` per tab, `flex` (no wrap, no scroll container) — many tabs in one group overflow invisibly. | `src/components/dock/dock-group.tsx:71-118` |
| V10 | `SplitDivider` is a `role="separator"` with `aria-orientation`, pointer-drag and double-click-to-50% but **no** `tabIndex`, no `aria-valuenow`, and it does not know its own ratio (props are `{direction, splitId}`), so it cannot be resized from the keyboard. | `src/components/dock/split-divider.tsx:14-23,52-63`, `src/components/dock/dock-tree-view.tsx:61` |
| V11 | Dock hotkeys today: `⌘/Ctrl+K` palette, `⌘/Ctrl+/` search, `⌘/Ctrl+B` sidebar, `?` cheatsheet, `Ctrl+Shift+K` close focused, `Alt+←/→` previous/next tab — all in one `keydown` listener with no editable-target guard on the Alt branches. | `src/lib/hooks/use-hotkeys.ts:52-99` |
| V12 | Dock pages are **not** error-isolated: `PAGE_COMPONENTS[path]` is rendered directly in three places; a page that throws takes the whole dock down. There is no error boundary anywhere in `src/` (`rg "componentDidCatch\|ErrorBoundary"` → 0 hits) and no toast system (`rg "[Tt]oast\|sonner"` → 0 hits). | `src/components/dock/dock-group.tsx:161-173`, `src/components/dock/dock-workspace.tsx:139-148`, `src/components/dock/dock-floating-window.tsx:212-222` |
| V13 | `panel-loader.tsx` has exactly one generic `loading()` spinner, `ssr:false`, and 22 entries; `panelComponent()` is exported but unused. `next/dynamic` is client-only. | `src/components/dock/panel-loader.tsx:17-23,25-118` |
| V14 | `PAGE_PATHS` and dock-tab labels/icons are **derived** from `ALL_NAV_ITEMS` — adding a nav item is enough for it to become a dock page with a label (but not enough to have a component). | `src/lib/dock/registry.ts:22-24,37-42`; `src/lib/nav.ts:171-173` |
| V15 | `ALL_NAV_ITEMS` expands nav items **and their children**, producing the 22 route paths; nav groups are Capture / Planning / Work / Structure / AI / System. | `src/lib/nav.ts:49-168` |
| V16 | The workspace router is classic Next routing; the dock mirrors the URL (`useDockSync`) and each page is also a standalone route. `RouterOutlet`/`DockWorkspace` switch on `uiStore.dockEnabled`. | `src/app/(workspace)/layout.tsx`, `src/lib/hooks/use-dock-sync.ts` |
| V17 | `/dashboard` is the boot target of the smoke test, the dock placeholder page, and the first preset panel — rebuilding it in place would break the P1.T9 smoke assertion and `PLACEHOLDER_PAGE_ID`. | `src/lib/dock/tree.ts:19-34`; master §5 ("test package + smoke"), P1.T9 |
| V18 | `taskSchema` has `status`/`priority` enums but **no** due date; `tasksRepo.normalize` maps every row on read (`dueDate` absent from `src/` entirely: `rg "dueDate\|dueAt" src` → 0 hits). Non-indexed fields can be added without a Dexie version bump — there is a documented precedent. | `src/lib/db/schema.ts:56-68,218-220` ("Not indexed — added without a Dexie version bump"), `src/lib/db/repos/tasks.ts` |
| V19 | `NOTE_TYPES` = idea, system, mechanic, research, experiment, note, lore, decision — **no** `daily`. `notesRepo.create({projectId,title})` defaults `type` to `"note"`. | `src/lib/db/schema.ts:13-26`, `src/lib/db/repos/notes.ts` |
| V20 | The single main-process PTY implementation is a singleton `ptyManager` (EventEmitter: `output` / `exit` / `changed`) with `list/get/buffer/clearBuffer/killAll/killKind/start/write/resize/kill` and Windows `taskkill /T /F` tree-kill. P1.T6 keeps it for P8 and deletes the launcher renderer that used it. | `desktop/src/main/pty.ts:28-165`; master F10 + D1 |
| V21 | The P1 preload exposes **`window.masarflow`** (lower-case) with `platform`, `app.info/openLogs/relaunch`, `dialog.chooseFolder`, `shell.openExternal/showItemInFolder`, `clipboard`, `window` (P2 adds `roots.list/covers` + `defaultPath` on `chooseFolder`). `getDesktop()` returns `window.masarflow ?? null`. | P0/P1 plan `:738-827`, `:1360-1363`; P1b–P4 plan `:1052-1055` |
| V22 | The raw launcher renderer is a working reference for an xterm panel: `xterm` + `@xterm/addon-fit`, `xtermTheme(accent)`, FitAddon + ResizeObserver, buffer re-attach, `onOutput/onExit`, `Ctrl+C`-with-selection copy, `\x16` paste. It was deleted with the launcher (P0/P1 plan `:1302-1313`), so P8 must re-add the deps to the **root** `package.json`. | `desktop/src/renderer/src/components/terminal/terminal-view.tsx:1-119` (still on disk at v0.1.5.1), P0/P1 plan `:1306,:1311` |
| V23 | `verify: RG "xterm" in root node_modules → not installed` — the root app has no terminal library today. | `ls node_modules \| rg xterm` → empty |
| V24 | The palette is a `Dialog` + cmdk (`shouldFilter` default = true, `value` strings carry the keywords) with three hard-coded groups (Create / Go to / Appearance) + Data; "Go to" iterates `ALL_NAV_ITEMS`. **No** entity results, **no** recent items, **no** dock commands. | `src/components/shell/command-palette.tsx:74-152` |
| V25 | `GlobalSearch` already does entity search over `buildSearchItems` + `createSearchIndex` (Fuse) — the palette must **reuse** that pipeline, not re-implement search. | `src/components/shell/global-search.tsx:17-67`, `src/lib/utils/search.ts:151-165` |
| V26 | cmdk 1.1.1 supplies `role="combobox"` (root), `listbox`, `option`, `group`, `separator` and `aria-activedescendant/expanded/selected`; the shared `Dialog` supplies `role="dialog"`, `aria-modal`, `aria-label`, an `Escape` handler and `document.body` scroll lock — but **no focus trap and no focus restore**. | `node_modules/cmdk/dist/index.mjs` (`role:"combobox"`, `role:"listbox"`, `role:"option"`, `aria-activedescendant`), `src/components/ui/dialog.tsx` |
| V27 | `LinkedProjectsDialog` (props `{projectId, roots, onClose}`) is opened only from the chat workspace and only stores `rootPath` in Dexie — the machine-level allow-list is `roots.json` (P2). | `src/components/chat/linked-projects-dialog.tsx:23-69`, `src/components/chat/chat-view.tsx:2320`, `src/lib/db/repos/linkedProjects.ts` |
| V28 | Existing dock test suites that P8 must keep green: serde 15, tree 69, dock-core 41, geometry 17, presets 11, registry 7, types 26, stores/dock 15 tests. | `tests/unit/lib/dock/*.test.ts`, `tests/unit/lib/stores/dock.test.ts` (`rg -c "it\("`) |
| V29 | Vitest is node-env only (`include: ["tests/unit/**/*.test.ts"]`, alias `@` → `src`); P1.T1 adds `@desktop` → `desktop/src/main` and `@desktop-shared` → `desktop/src/shared`. No jsdom, no `.tsx` tests. | `tests/vitest.config.ts:1-15`; P0/P1 plan P1.T1 |
| V30 | Verified present in the installed `lucide-react`: `CalendarDays, ScrollText, SquareTerminal, MonitorCog, TriangleAlert, CircleAlert, ListChecks, Undo2, RefreshCw, Copy, Info, FolderOpen, Timer, Activity, Ban, Clock, CircleSlash, GitBranch, GitCommitHorizontal, Play, AppWindow, ClipboardPaste, Trash2, X, Maximize2, MoreHorizontal, PanelLeftClose`. **`History` is NOT in this build** (grep of the `.d.ts` → 0 hits) — the palette's Recent group uses `Clock`. | `grep -c "declare const <Icon>:" node_modules/lucide-react/dist/lucide-react.d.ts` |
| V31 | Root scripts: `pnpm test` (vitest run), `pnpm typecheck` (tsc --noEmit), `pnpm lint` (eslint), `pnpm e2e` (playwright), `pnpm desktop:dev|build|start|dist|typecheck`. | `package.json:8-26` |
| V32 | `ConfirmDialog` and `EmptyState` already exist as shared UI; the workspace layout already mounts `GlobalSearch`, `CommandPalette` and `ShortcutsDialog`. | `src/components/ui/confirm-dialog.tsx`, `src/components/ui/empty-state.tsx`, `src/app/(workspace)/layout.tsx` |
| V33 | Projects list for a "switch project" command: `projectsRepo.all()/get()/count()`; the active project lives in `useProjectStore.activeProjectId` and the dock mirrors it via `setProject(id)`. | `src/lib/db/repos/projects.ts:28-39`, `src/lib/stores/project.ts`, `src/lib/stores/dock.ts:162-168` |

## Findings that shape this phase (`A#` = verified defect/gap, `B#` = verified constraint)

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| A1 | **Migrations are a stub, and validation is all-or-nothing**: one hand-edited or older key (`activePage` not in `pages`, `"?"`-prefixed params, absurd floater geometry) discards the *entire* saved layout silently. | V1, V2 | T1 implements `migrate()` as a real v1→v2 repair pass and wires it into `parseProjectState`; the version bump makes the path testable end-to-end |
| A2 | **A drop is committed with zero validation and a wrong target silently loses layout position** (edge drop on the dragged group → root insert fallback) or, for a `split` target, would drop the panel from the tree entirely. | V6, V7, V8 | T7 adds the pure `dropVerdict()` + wiring; the overlay explains refusals instead of teleporting panels |
| A3 | **Destructive dock actions have no undo and no feedback**: closing a panel, resetting a workspace and (new) deleting a workspace are one click with no confirmation, no toast, no history — and `resetWorkspace` clears all per-panel params. | V4, V5 | T3 (undo stack) + T4 (toasts) + T11 (confirmation is *not* needed where undo exists; delete workspace keeps a confirm) |
| A4 | **Dock interaction is not keyboard-complete**: tabs have no arrow-key handling, dividers cannot be resized or even focused, focus cannot move between splits, and there is no float/close/collapse shortcut beyond `Ctrl+Shift+K`. | V9, V10, V11 | T6, T8, T9 add the WAI-ARIA tabs pattern, focusable dividers, spatial focus movement and an `Alt`-based keymap — all pure-testable except the wiring |
| A5 | **One crashed page kills the whole dock** (no boundary) and every panel load shows the same anonymous spinner. | V12, V13 | T5 adds `PanelErrorBoundary` + a labelled skeleton + a static guard test |
| A6 | The three capabilities the user lost with the retired launcher (terminal, log tail, runtime/env facts) have **no route at all** in the workspace app, while `ptyManager` and the P1/P2 IPC contracts already exist. | V20, V21, V22, V23, V27 | T12–T15 add the IPC contract + three dock pages; the terminal is a normal dock panel, so it can be split, tabbed, floated and persisted |
| A7 | `/dashboard` is metric-heavy and load-bearing (boot target, placeholder page, first preset panel). A "what do I do now" page has a different hierarchy. | V17 | **Decision:** add `/today` as a new route; do **not** rewrite `/dashboard`. Reasoning + cost in T16 |
| A8 | **Due dates do not exist** — "due/overdue" in the Today view would be a lie unless the field is added. | V18 | T17 adds a non-indexed `dueDate` to `taskSchema` + `tasksRepo.normalize` + a row-level control in the Today list (no Dexie bump, precedent at `schema.ts:218-220`) |
| A9 | The palette cannot show entities or recent items because cmdk's built-in filter owns the list and `ALL_NAV_ITEMS` is its only data source; the entity search pipeline *does* exist and is already used by `GlobalSearch`. | V24, V25 | T20–T22: pure command registry + pure recents + `shouldFilter={false}` palette that reuses `buildSearchItems`/`createSearchIndex` and the P5 registry |
| A10 | **Duplicate panels of the same entity are not reachable through the UI**: panel identity is the *path* (`applyUrlFocus` targets by `pageIdOf`, `openPanel` focuses or inserts the path), and the query is only a per-panel snapshot. Two panels with the same path require hand-editing localStorage or `importLayout`. | `src/lib/dock/dock-core.ts:130-166`, `:144-154`; `src/lib/dock/tree.ts:206-308` | **Decision:** no conflict UI. T10 ships the invariant helper (`panelsForPath`) + a test that proves the dock cannot hold two panels of one path + the palette labels an already-open entity **"Focus"** instead of "Open". The residual conflict story is documented in T10 (one line each: what P8 guarantees, what stays out of scope) |
| A11 | Layout persistence is **per browser origin** (localStorage `masarflow-dock-v1`), not per project folder, and can be wiped by clearing site data; there is no export/import. | V2, V4 | T2 adds `exportLayout`/`importLayout`/`applyLayout` (pure) + store actions, exposed in the workspace menu (T11) and defended by tests |
| B1 | The dock state is a zustand `persist` store whose `merge` already funnels through `parseProjectState`; changing parse behaviour is the *only* change needed for migrations. | V2 | T1 needs no store edit — say it in the commit message instead of touching the store |
| B2 | A new nav entry automatically becomes a dock page id with a label/icon, but **not** a component: `PAGE_COMPONENTS` is hand-written. | V14, V13 | T16 adds the four `dynamic()` entries **and** a static guard test (every `PAGE_PATHS` entry has a loader entry) so this can never drift again |
| B3 | The P5 registry is the only entity language: `entityHref` (kind→URL), `KIND_META` (label/route/param), `refFromUrl`, `openEntity`, `EntityChip`, `activityRepo.listRecent`. P8 must not write a second one. | P5 plan §"Architecture"; master §10 | T18/T20/T22 import those modules; no new kind tables, no new href builders |
| B4 | Vitest is node-env with no `.tsx` tests: every behaviour P8 wants proven must live in a `.ts` module. | V29 | Every task below puts logic in `src/lib/**` (or `desktop/src/**`) and keeps `.tsx` thin |
| B5 | The terminal must stay inside the P2 root allow-list: the renderer may only name a `cwd`, the main process decides whether it is allowed. | P1b–P4 plan `:862-873`, `:1030-1047` (master D3) | T12 validates `cwd` in the **main** process against `roots.json` before `ptyManager.start`; the UI *shows* the check result (`roots.covers`) but is never the authority |

---

## File map

```
NEW (pure lib, unit-tested)
src/lib/dock/panels.ts          panelsForPath / slotOf — the one-panel-per-path invariant (A10)
src/lib/dock/dropguard.ts       dropVerdict() + draggedPanels()/draggedNodeId()        (A2)
src/lib/dock/nav-geo.ts         layoutRects / neighborInDirection / focusTargetOf      (A4)
src/lib/dock/keymap.ts          dockActionFor(): Alt-key -> DockKeyAction              (A4)
src/lib/dock/undo.ts            rememberUndo/takeUndo/peekUndo/clearUndo (ring, cap 10) (A3)
src/lib/dock/overflow.ts        tabCounts / shouldUseTabMenu                           (A4)
src/lib/ui/toast-queue.ts       enqueue/dismiss/prune/nextExpiry                        (A3)
src/lib/ui/focus-trap.ts        stepIndex(): pure Tab-wrap math                         (palette a11y)
src/lib/ui/viewport.ts          viewportMode(width): compact | regular | wide           (narrow windows)
src/lib/utils/relative-time.ts  formatRelativeTime(ts, now) for the Today feed        (T18)
src/lib/stores/toast.ts         zustand toast store + pushToast()
src/lib/stores/recent.ts        per-project recent pages/entities (pure pushRecent)
src/lib/commands/registry.ts    pure command model + when() predicates + commandList()
src/lib/commands/filter.ts      pure filterCommands() (query + mode chips)
src/lib/today/model.ts          dayKey/startOfDay/endOfDay/bucketOf/groupTasks          (A8)
src/lib/today/daily-note.ts     dailyNoteTitle/findDailyNote/openDailyNote              (A8/V19)
src/lib/today/tasks.ts          dueDate write helpers (setTaskDue/clearTaskDue)
src/lib/tools/terminal.ts       client-side pure helpers (sessionLabel/exitNote/shellName)
src/lib/tools/logs.ts           lineLevel() + levelClass() for the log viewer
src/lib/tools/system.ts         formatBytes/storageSummary/describeRoot
desktop/src/shared/terminal.ts  resolveShell/validateTerminalStart (pure, tested)       (B5)
desktop/src/main/logs.ts        safeLogName/tailLines/listLogs/readLogTail (pure, tested)
desktop/src/main/ipc/terminal.ts registerTerminalIpc(getWindow)                         (A6)
desktop/src/main/ipc/logs.ts     registerLogsIpc()

NEW (components / routes)
src/components/dock/panel-error.tsx        PanelErrorBoundary + PanelMissing            (A5)
src/components/dock/panel-loading.tsx      labelled skeleton                          (A5)
src/components/dock/tab-menu.tsx           "All tabs (N)" menu for long strips        (A4)
src/components/dock/right-click-menu.tsx   TabActionsMenu — right-click a tab: every dock verb (T6)
src/components/ui/toaster.tsx              toast stack (role=status, aria-live)       (A3)
src/lib/hooks/use-focus-trap.ts            controlled Tab-wrap + Escape restore       (T22)
src/lib/hooks/use-terminal-sync.ts         keeps terminal sessions honest across reloads (T13)
src/components/tools/terminal-panel.tsx    xterm + sessions + root guard banner       (A6)
src/components/tools/logs-panel.tsx        log picker + tail view + level filter
src/components/tools/system-panel.tsx      versions, roots, storage, table counts
src/components/today/today-view.tsx        the "what do I do now" dashboard           (A7)
src/components/today/today-task-list.tsx   bucket lists + due-date control
src/components/today/today-activity.tsx    P5 activity feed with EntityChips
src/components/today/today-git.tsx         P6 git card (guarded, T19)
src/app/(workspace)/today/page.tsx
src/app/(workspace)/tools/terminal/page.tsx
src/app/(workspace)/tools/logs/page.tsx
src/app/(workspace)/tools/system/page.tsx

MODIFIED
src/lib/dock/serde.ts                 real migrate() + v2 schema + repair helpers      (A1)
src/lib/dock/types.ts                 version: 2; DockDragState.refused?               (A1, A2)
src/lib/dock/presets.ts               version: 2 | new WORKSPACE_PRESETS entry "Today" (A7)
src/lib/dock/dock-core.ts             deleteWorkspace/exportLayout/importLayout/applyLayout (A11)
src/lib/dock/geometry.ts              resizeDelta()                                    (A4)
src/lib/dock/tree.ts                  no behaviour change (every helper P8 needs — findNode/findHolder/collectPages/normalizeTree — is already exported)
src/lib/stores/dock.ts                undo/deleteWorkspace/exportLayout/importLayout + undo+toast on close/reset
src/lib/hooks/use-hotkeys.ts          dockActionFor wiring + editable-target guard     (A4)
src/lib/hooks/use-dock-sync.ts        unchanged behaviour; document the palette path    (B1)
src/lib/hooks/use-narrow-viewport.ts  viewportMode + resize listener
src/lib/nav.ts                        Today item + Tools group                         (B2)
src/components/dock/dock-group.tsx    overflow/scroll, keyboard tabs, error boundary, right-click menu (A4, A5)
src/components/dock/dock-tree-view.tsx pass ratio to SplitDivider                       (A4)
src/components/dock/split-divider.tsx a11y + keyboard resize                            (A4)
src/components/dock/dock-workspace.tsx data-dock-workspace, drop verdict in hit-test, boundary (A2, A5)
src/components/dock/use-dock-dnd.tsx  verdict re-check + refused commit path            (A2)
src/components/dock/dock-overlay.tsx  refusal chip                                        (A2)
src/components/dock/dock-floating-window.tsx  boundary + tab-menu reuse                 (A5)
src/components/shell/sidebar.tsx      auto-collapse in compact mode                       (T23)
src/components/dock/workspace-menu.tsx duplicate/delete/undo/copy-paste layout           (A3, A11)
src/components/dock/panel-loader.tsx  4 new pages + shared loading                        (B2)
src/components/shell/command-palette.tsx  v2: chips, entities, recents, dock commands    (A9)
src/components/shell/shortcuts-dialog.tsx new Dock + Tools groups
src/components/shell/topbar.tsx       "Desktop app" chip + Today button                    (A6)
src/app/(workspace)/layout.tsx        <Toaster/> + installTerminalTracking (T13)
src/lib/db/schema.ts                  taskSchema.dueDate (non-indexed)                    (A8)
src/lib/db/repos/tasks.ts             dueDate in normalize()
desktop/src/shared/channels.ts        CH.terminal* + CH.logs* channel keys                 (T12, T14)
desktop/src/shared/api.ts             DesktopApi types for terminal + logs                 (T12, T14)
desktop/src/preload/index.ts          exposes the terminal + logs bridges                  (T12, T14)
desktop/src/main/ipc/index.ts         registers the terminal + logs handlers               (T12, T14)
desktop/src/main/window.ts            killAll() on window unload (no orphaned shells)      (T12)
package.json                          xterm + @xterm/addon-fit                            (V22, V23)
tests/vitest.config.ts                (already extended by P1.T1 with @desktop/@desktop-shared)

NEW TESTS
tests/unit/_helpers/fs-scan.ts             (T5) shared static-file reader for guard tests
tests/unit/lib/dock/migrate.test.ts        (T1)
tests/unit/lib/dock/workspaces.test.ts     (T2)
tests/unit/lib/dock/undo.test.ts           (T3)
tests/unit/ui/toast-queue.test.ts          (T4)
tests/unit/lib/dock/panels-guard.test.ts   (T5, static)
tests/unit/lib/dock/overflow.test.ts       (T6)
tests/unit/lib/dock/dropguard.test.ts      (T7)
tests/unit/lib/dock/resize-key.test.ts     (T8)
tests/unit/lib/dock/nav-geo.test.ts        (T9)
tests/unit/lib/dock/keymap.test.ts         (T9)
tests/unit/lib/dock/panels.test.ts         (T10)
tests/unit/tools/terminal-client.test.ts   (T13)
tests/unit/tools/system.test.ts            (T15)
tests/unit/tools/terminal-contract.test.ts (T12)
tests/unit/tools/logs.test.ts              (T14)
tests/unit/nav-parity.test.ts              (T16, static)
tests/unit/lib/today/model.test.ts         (T17)
tests/unit/utils/relative-time.test.ts     (T18)
tests/unit/commands/registry.test.ts       (T20)
tests/unit/commands/filter.test.ts         (T20)
tests/unit/stores/recent.test.ts           (T21)
tests/unit/ui/focus-trap.test.ts           (T22)
tests/unit/ui/viewport.test.ts             (T23)
tests/unit/ui/no-native-dialogs.test.ts    (T24, static)

MODIFIED TESTS (extended in place, never weakened)
tests/unit/lib/dock/serde.test.ts          version literal -> 2, +1 parse-through-migrate case (T1)
tests/unit/lib/dock/dock-core.test.ts      version literal -> 2, +Workspace lifecycle cases    (T1, T2)
```

---

## P8.T1 — Real persisted-layout migrations: `serde.migrate()` + version 2 (TDD, ≈12 min)

**Create `tests/unit/lib/dock/migrate.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { migrate, parseProjectState } from "@/lib/dock/serde";

/** A v1 payload as written by the current build, then damaged the way real
 *  hand-edits / older builds damage it: "?"-prefixed params, a duplicate page,
 *  an activePage that is not a member, absurd floater geometry, dead panel
 *  references in collapsedPanels / maximizedPanelId / focusGroupId. */
function damagedV1() {
  return {
    version: 1,
    activeWorkspace: "Development",
    workspaces: {
      Development: {
        tree: {
          type: "tabs",
          id: "t1",
          activePage: "/gone",
          pages: ["/tasks", "/specs", "/tasks"],
        },
        params: { "/tasks": "?task=a1", "/gone": "?x=1" },
      },
      Broken: { tree: { type: "page", id: "p1", pageId: "" }, params: {} },
    },
    floaters: [
      {
        id: "f1",
        panelIds: ["/chat", "/chat"],
        activePanel: "/nope",
        x: -50,
        y: 10,
        width: 40,
        height: 9000,
        z: 7,
        minimized: "yes",
        maximized: null,
      },
    ],
    collapsedPanels: ["/tasks", "/never"],
    maximizedPanelId: "/never",
    focusGroupId: "no-such-node",
  };
}

describe("migrate", () => {
  it("never throws on junk", () => {
    for (const value of [null, 42, "nope", [], { version: 1 }, { version: 1, workspaces: 7 }]) {
      expect(() => migrate(value)).not.toThrow();
    }
  });

  it("leaves a current payload untouched", () => {
    const v2 = { version: 2, hello: "world" };
    expect(migrate(v2)).toBe(v2);
  });

  it("leaves an unknown future version untouched (validation decides)", () => {
    const v3 = { version: 3, workspaces: {} };
    expect(migrate(v3)).toBe(v3);
    expect(parseProjectState(v3)).toBeNull();
  });

  it("returns the raw payload when nothing is repairable", () => {
    const raw = { version: 1, workspaces: { X: { tree: { type: "nope" }, params: {} } } };
    expect(migrate(raw)).toBe(raw);
    expect(parseProjectState(raw)).toBeNull();
  });
});

describe("parseProjectState on a damaged v1 payload", () => {
  it("migrates instead of discarding the layout", () => {
    const state = parseProjectState(damagedV1());
    expect(state).not.toBeNull();
    expect(state!.version).toBe(2);
  });

  it("repairs the tree: duplicate pages dropped, activePage repaired", () => {
    const state = parseProjectState(damagedV1())!;
    expect(state.workspaces.Development.tree).toEqual({
      type: "tabs",
      id: "t1",
      activePage: "/tasks",
      pages: ["/tasks", "/specs"],
    });
  });

  it("drops unrepairable workspaces and falls back to a survivor", () => {
    const state = parseProjectState({ ...damagedV1(), activeWorkspace: "Broken" })!;
    expect(Object.keys(state.workspaces)).toEqual(["Development"]);
    expect(state.activeWorkspace).toBe("Development");
  });

  it("canonicalizes params and prunes keys for panels that no longer exist", () => {
    const state = parseProjectState(damagedV1())!;
    expect(state.workspaces.Development.params).toEqual({ "/tasks": "task=a1" });
  });

  it("clamps floater geometry, rebases z, dedupes panels", () => {
    const state = parseProjectState(damagedV1())!;
    expect(state.floaters).toHaveLength(1);
    expect(state.floaters[0]).toMatchObject({
      id: "f1",
      panelIds: ["/chat"],
      activePanel: "/chat",
      x: 0,
      y: 10,
      width: 280,
      height: 6000,
      z: 1,
      minimized: false,
      maximized: false,
    });
  });

  it("clears dangling collapsed/maximized/focus references", () => {
    const state = parseProjectState(damagedV1())!;
    expect(state.collapsedPanels).toEqual(["/tasks"]);
    expect(state.maximizedPanelId).toBeNull();
    expect(state.focusGroupId).toBeNull();
  });

  it("keeps a valid focusGroupId", () => {
    const payload = damagedV1();
    payload.focusGroupId = "t1";
    expect(parseProjectState(payload)!.focusGroupId).toBe("t1");
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/migrate.test.ts`
Expected: **FAIL** — today the damaged v1 payload parses to `null`, so `expect(state).not.toBeNull()` fails first (and `expected 1 to be 2` guards the version once it parses).

**Replace `src/lib/dock/serde.ts` entirely with:**

```ts
/**
 * Serde + validation for persisted dock layouts.
 *
 * The persisted JSON is untrusted (localStorage): parseProjectState either
 * returns a fully valid ProjectDockState or null — it never throws and never
 * returns a partial state, so callers fall back to defaults on null.
 *
 * Before validation every payload is migrated to DOCK_STATE_VERSION:
 * a payload written by an older build is repaired field-by-field (canonical
 * params, tree invariants, floater geometry, dangling references) and then
 * validated. Payloads of an unknown version are returned unchanged and
 * therefore fail validation -> defaults. Repair is strictly better than the
 * previous all-or-nothing behaviour, where a single hand-edited key discarded
 * the whole layout.
 *
 * The node invariants (binary splits, ratio range, unique pages, activePage
 * membership) are checked by validateNode from types.ts and reused here so
 * serde and programmatic construction agree on one rule set.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import { z } from "zod";
import type { DockNode, FloatWindow, ProjectDockState } from "./types";
import { MAX_RATIO, MIN_RATIO, validateNode } from "./types";
import { collectPages, findNode, normalizeTree } from "./tree";

/** Current persisted schema version. Bump this and add a step to `migrate`. */
export const DOCK_STATE_VERSION = 2;

/** Floater repair bounds — mirrors MIN_W / MIN_H in dock-floating-window.tsx. */
const MIN_FLOATER_WIDTH = 280;
const MIN_FLOATER_HEIGHT = 160;
/** Absurd geometry from hand edits is clamped to a plausible virtual desktop. */
const MAX_FLOATER_EXTENT = 6000;

/**
 * The shape of a DockNode, validated structurally (not field-by-field) via
 * validateNode. z.lazy handles the recursion; the refine enforces the
 * invariants the type system cannot express.
 */
export const dockNodeSchema: z.ZodType<DockNode> = z.lazy(() =>
  z
    .any()
    .refine((v) => validateNode(v).ok, { message: "invalid dock node" }),
);

const floatWindowSchema = z.object({
  id: z.string().min(1),
  panelIds: z.array(z.string().min(1)).min(1),
  activePanel: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
  z: z.number().finite(),
  minimized: z.boolean(),
  maximized: z.boolean(),
});

const workspaceSchema = z.object({
  tree: dockNodeSchema,
  params: z.record(z.string(), z.union([z.string(), z.undefined()])),
});

export const projectDockStateSchema: z.ZodType<ProjectDockState> = z.object({
  version: z.literal(DOCK_STATE_VERSION),
  activeWorkspace: z.string(),
  workspaces: z.record(z.string(), workspaceSchema),
  floaters: z.array(floatWindowSchema),
  collapsedPanels: z.array(z.string()),
  maximizedPanelId: z.union([z.string(), z.null()]),
  focusGroupId: z.union([z.string(), z.null()]),
});

// ── Repair helpers (payload -> payload, never throws) ───────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** v1 could persist a query that still carried its "?" — "/x" + "?a=b". */
function canonicalQuery(value: string): string {
  return value.startsWith("?") ? value.slice(1) : value;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0 && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

/**
 * Repair one node. Returns null when nothing is recoverable (wrong shape,
 * empty pages, unknown type). Splits are re-folded onto the binary invariant:
 * one surviving child -> that child; three or more -> the first two survive
 * (a 3-way split cannot be represented, and dropping the tail is visible in
 * the layout rather than fatal).
 */
function repairNode(raw: unknown): DockNode | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;

  switch (raw.type) {
    case "split": {
      const children = Array.isArray(raw.children)
        ? raw.children
            .map(repairNode)
            .filter((child): child is DockNode => child !== null)
        : [];
      if (children.length === 0) return null;
      if (children.length === 1) return children[0];
      return {
        type: "split",
        id,
        direction: raw.direction === "vertical" ? "vertical" : "horizontal",
        ratio: clampNumber(finite(raw.ratio, 0.5), MIN_RATIO, MAX_RATIO),
        children: children.slice(0, 2),
      };
    }
    case "tabs": {
      const pages = stringList(raw.pages);
      if (pages.length === 0) return null;
      const wanted = str(raw.activePage);
      const activePage = wanted && pages.includes(wanted) ? wanted : pages[0];
      // Fold single-page groups exactly like normalizeTree does (id kept).
      if (pages.length === 1) return { type: "page", id, pageId: pages[0] };
      return { type: "tabs", id, activePage, pages };
    }
    case "page": {
      const pageId = str(raw.pageId);
      return pageId ? { type: "page", id, pageId } : null;
    }
    default:
      return null;
  }
}

function repairTree(raw: unknown): DockNode | null {
  const node = repairNode(raw);
  return node ? normalizeTree(node) : null;
}

function repairFloater(raw: unknown, index: number): FloatWindow | null {
  if (!isRecord(raw)) return null;
  const panelIds = stringList(raw.panelIds);
  if (panelIds.length === 0) return null;
  const wanted = str(raw.activePanel);
  return {
    id: str(raw.id) ?? `float_repaired_${index}`,
    panelIds,
    activePanel: wanted && panelIds.includes(wanted) ? wanted : panelIds[0],
    x: clampNumber(finite(raw.x, 40), 0, MAX_FLOATER_EXTENT),
    y: clampNumber(finite(raw.y, 40), 0, MAX_FLOATER_EXTENT),
    width: clampNumber(finite(raw.width, 560), MIN_FLOATER_WIDTH, MAX_FLOATER_EXTENT),
    height: clampNumber(finite(raw.height, 420), MIN_FLOATER_HEIGHT, MAX_FLOATER_EXTENT),
    z: index + 1,
    minimized: raw.minimized === true,
    maximized: raw.maximized === true,
  };
}

/**
 * Bring a persisted payload up to DOCK_STATE_VERSION.
 * - version 1 -> 2: repair trees, canonicalize + prune params, clamp floater
 *   geometry, re-base z-order, clear dangling activeWorkspace / maximized /
 *   focusGroupId / collapsed references.
 * - any other version: returned untouched (validation decides).
 * Never throws.
 */
export function migrate(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  if (raw.version !== 1) return raw;

  const workspaces: Record<string, unknown> = {};
  if (isRecord(raw.workspaces)) {
    for (const [name, entry] of Object.entries(raw.workspaces)) {
      if (name.length === 0 || !isRecord(entry)) continue;
      const tree = repairTree(entry.tree);
      if (!tree) continue;
      workspaces[name] = { tree, params: isRecord(entry.params) ? { ...entry.params } : {} };
    }
  }
  const names = Object.keys(workspaces);
  if (names.length === 0) return raw; // nothing repairable -> validation rejects

  const floaters = Array.isArray(raw.floaters)
    ? raw.floaters
        .map((floater, index) => repairFloater(floater, index))
        .filter((floater): floater is FloatWindow => floater !== null)
    : [];

  // Every panel id known to the payload: trees + floaters.
  const panels = new Set<string>();
  for (const name of names) {
    const entry = workspaces[name] as { tree: DockNode };
    for (const panelId of collectPages(entry.tree)) panels.add(panelId);
  }
  for (const floater of floaters) for (const id of floater.panelIds) panels.add(id);

  for (const name of names) {
    const entry = workspaces[name] as { tree: DockNode; params: Record<string, unknown> };
    const params: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(entry.params)) {
      if (typeof value !== "string" || !panels.has(key)) continue;
      params[key] = canonicalQuery(value);
    }
    workspaces[name] = { tree: entry.tree, params };
  }

  const wantWorkspace = str(raw.activeWorkspace);
  const activeWorkspace =
    wantWorkspace && workspaces[wantWorkspace] ? wantWorkspace : names[0];
  const activeTree = (workspaces[activeWorkspace] as { tree: DockNode }).tree;

  const collapsed = stringList(raw.collapsedPanels).filter((id) => panels.has(id));
  const maximized = str(raw.maximizedPanelId);
  const focus = str(raw.focusGroupId);

  return {
    version: DOCK_STATE_VERSION,
    activeWorkspace,
    workspaces,
    floaters,
    collapsedPanels: collapsed,
    maximizedPanelId: maximized && panels.has(maximized) ? maximized : null,
    focusGroupId: focus && findNode(activeTree, focus) ? focus : null,
  };
}

/** Parse untrusted persisted JSON into a ProjectDockState, or null. */
export function parseProjectState(raw: unknown): ProjectDockState | null {
  const result = projectDockStateSchema.safeParse(migrate(raw));
  return result.success ? result.data : null;
}
```

**Bump the version everywhere it is written (three files, four lines):**

1. `src/lib/dock/types.ts:39` — `version: 1;` → `version: 2;`
2. `src/lib/dock/presets.ts:79` — `version: 1,` → `version: 2,`
3. `tests/unit/lib/dock/serde.test.ts:27` — `version: 1,` → `version: 2,`
4. `tests/unit/lib/dock/dock-core.test.ts:50` — `version: 1,` → `version: 2,`

Append to `tests/unit/lib/dock/serde.test.ts` (inside the existing top-level `describe`) — the regression that matters for the store's rehydrate path:

```ts
describe("olds layouts keep loading", () => {
  it("a v1 payload written by the previous build still parses", () => {
    const v1 = {
      version: 1,
      activeWorkspace: "Development",
      workspaces: {
        Development: {
          tree: { type: "page", id: "p1", pageId: "/dashboard" },
          params: {},
        },
      },
      floaters: [],
      collapsedPanels: [],
      maximizedPanelId: null,
      focusGroupId: null,
    };
    const state = parseProjectState(v1);
    expect(state).not.toBeNull();
    expect(state!.version).toBe(2);
    expect(state!.workspaces.Development.tree.type).toBe("page");
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/migrate.test.ts tests/unit/lib/dock/serde.test.ts tests/unit/lib/dock/dock-core.test.ts`
Expected: **PASS** — `Test Files 3 passed` with the new migrate suite reporting `Tests 11 passed`; zero failures is the gate. Then `pnpm typecheck` → exit 0 — the literal-version change is compile-visible, which is exactly why T1 bumps it before writing any repair code.

Commit: `feat(dock): migrate persisted v1 layouts to dock-state v2 instead of discarding them`

---

## P8.T2 — Workspace lifecycle: delete, export, import (pure, TDD, ≈8 min)

**Create `tests/unit/lib/dock/workspaces.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { defaultProjectState } from "@/lib/dock/presets";
import {
  applyLayout,
  deleteWorkspace,
  exportLayout,
  importLayout,
} from "@/lib/dock/dock-core";

describe("deleteWorkspace", () => {
  it("refuses to delete the last workspace", () => {
    const s = defaultProjectState();
    const only = { ...s, workspaces: { Development: s.workspaces.Development } };
    expect(deleteWorkspace(only, "Development")).toBe(only);
  });

  it("deletes a background workspace and keeps the active one", () => {
    const s = defaultProjectState();
    const next = deleteWorkspace(s, "Planning");
    expect(Object.keys(next.workspaces)).toEqual(["Development", "Debugging", "AI Research"]);
    expect(next.activeWorkspace).toBe("Development");
  });

  it("switches to a survivor when the active workspace is deleted", () => {
    const next = deleteWorkspace(defaultProjectState(), "Development");
    expect(next.activeWorkspace).toBe("Planning");
    expect(next.workspaces.Development).toBeUndefined();
  });

  it("ignores an unknown name", () => {
    const s = defaultProjectState();
    expect(deleteWorkspace(s, "Nope")).toBe(s);
  });
});

describe("export / import layout", () => {
  it("round-trips the active workspace", () => {
    const s = defaultProjectState();
    const layout = importLayout(exportLayout(s));
    expect(layout).not.toBeNull();
    expect(layout!.name).toBe("Development");
    expect(layout!.tree).toEqual(s.workspaces.Development.tree);
  });

  it("rejects junk", () => {
    expect(importLayout("{")).toBeNull();
    expect(importLayout("null")).toBeNull();
    expect(importLayout(JSON.stringify({ tree: { type: "bogus" } }))).toBeNull();
    expect(importLayout(JSON.stringify({ tree: null }))).toBeNull();
  });

  it("canonicalizes params and defaults a missing name", () => {
    const layout = importLayout(
      JSON.stringify({
        tree: { type: "page", id: "p1", pageId: "/tasks" },
        params: { "/tasks": "?task=t1" },
      }),
    )!;
    expect(layout.name).toBe("Imported");
    expect(layout.params).toEqual({ "/tasks": "task=t1" });
  });

  it("applyLayout picks a free name and activates it", () => {
    const s = defaultProjectState();
    const layout = importLayout(exportLayout(s))!;
    const next = applyLayout(s, layout);
    expect(Object.keys(next.workspaces)).toContain("Development 2");
    expect(next.activeWorkspace).toBe("Development 2");
    expect(next.workspaces["Development 2"].tree).not.toBe(s.workspaces.Development.tree);
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/workspaces.test.ts`
Expected: **FAIL** — `TypeError: deleteWorkspace is not a function` (the export does not exist).

**Append to `src/lib/dock/dock-core.ts`** (below `resetWorkspace`, and extend the import block at the top with `dockNodeSchema` from `./serde`):

```ts
// ── Workspace lifecycle: delete / export / import ───────────────────────────
// (import added at the top of the file:)
//   import { dockNodeSchema, DOCK_STATE_VERSION } from "./serde";

/**
 * Delete a named workspace. The last surviving workspace is never deleted
 * (the dock must always have somewhere to live); deleting the active one
 * switches to the first survivor.
 */
export function deleteWorkspace(
  s: ProjectDockState,
  name: string,
): ProjectDockState {
  const names = Object.keys(s.workspaces);
  if (names.length <= 1 || !s.workspaces[name]) return s;
  const workspaces = { ...s.workspaces };
  delete workspaces[name];
  const activeWorkspace =
    s.activeWorkspace === name ? Object.keys(workspaces)[0] : s.activeWorkspace;
  return { ...s, activeWorkspace, workspaces };
}

/** The on-disk shape of a shared/copied layout (T11 puts it on the clipboard). */
export interface LayoutFile {
  version: number;
  name: string;
  tree: DockNode;
  params: Record<string, string | undefined>;
}

/** Serialize the ACTIVE workspace as a portable layout file. */
export function exportLayout(s: ProjectDockState): string {
  const entry = ws(s);
  const file: LayoutFile = {
    version: DOCK_STATE_VERSION,
    name: s.activeWorkspace,
    tree: entry.tree,
    params: entry.params,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Parse a layout file produced by exportLayout (or hand-written with the same
 * shape). Returns null when the tree is not a valid dock tree — the caller
 * shows "That is not a MasarFlow layout file." instead of corrupting the dock.
 */
export function importLayout(text: string): LayoutFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const parsed = dockNodeSchema.safeParse(record.tree);
  if (!parsed.success) return null;

  const params: Record<string, string | undefined> = {};
  if (record.params && typeof record.params === "object" && !Array.isArray(record.params)) {
    for (const [key, value] of Object.entries(record.params as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      params[key] = value.startsWith("?") ? value.slice(1) : value;
    }
  }
  const name =
    typeof record.name === "string" && record.name.trim().length > 0
      ? record.name.trim()
      : "Imported";
  return {
    version: DOCK_STATE_VERSION,
    name,
    tree: normalizeTree(parsed.data),
    params,
  };
}

/** Install an imported layout under a free workspace name and switch to it. */
export function applyLayout(s: ProjectDockState, layout: LayoutFile): ProjectDockState {
  let name = layout.name;
  let n = 2;
  while (s.workspaces[name]) {
    name = `${layout.name} ${n}`;
    n += 1;
  }
  return {
    ...s,
    activeWorkspace: name,
    workspaces: {
      ...s.workspaces,
      [name]: { tree: normalizeTree(layout.tree), params: { ...layout.params } },
    },
  };
}
```

Run: `pnpm test -- tests/unit/lib/dock/workspaces.test.ts`
Expected: **PASS** — `Test Files 1 passed`, `Tests 8 passed`.

Commit: `feat(dock): delete, export and import workspaces (pure reducers + tests)`

---

## P8.T3 — Dock undo: recover from close / reset / delete (pure, TDD, ≈6 min)

**Create `tests/unit/lib/dock/undo.test.ts` (failing):**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { defaultProjectState } from "@/lib/dock/presets";
import {
  clearUndo,
  peekUndo,
  rememberUndo,
  takeUndo,
  undoDepth,
} from "@/lib/dock/undo";

const state = (tag: string) => ({ ...defaultProjectState(), activeWorkspace: tag });

beforeEach(() => clearUndo());

describe("dock undo history", () => {
  it("is last-in-first-out and per project", () => {
    rememberUndo("p1", "Closed Task Boards", state("A"));
    rememberUndo("p1", "Closed Notes", state("B"));
    rememberUndo("p2", "Closed Chat", state("C"));

    expect(undoDepth("p1")).toBe(2);
    expect(takeUndo("p1")?.label).toBe("Closed Notes");
    expect(takeUndo("p1")?.label).toBe("Closed Task Boards");
    expect(takeUndo("p1")).toBeNull();
    expect(peekUndo("p2")?.label).toBe("Closed Chat");
  });

  it("peek does not consume", () => {
    rememberUndo("p1", "Reset workspace", state("A"));
    expect(peekUndo("p1")?.label).toBe("Reset workspace");
    expect(undoDepth("p1")).toBe(1);
  });

  it("keeps only the 10 newest entries", () => {
    for (let i = 1; i <= 12; i += 1) rememberUndo("p1", `step ${i}`, state("A"));
    expect(undoDepth("p1")).toBe(10);
    expect(takeUndo("p1")?.label).toBe("step 12");
    for (let i = 0; i < 9; i += 1) takeUndo("p1");
    expect(takeUndo("p1")?.label).toBe("step 3");
  });

  it("returns a snapshot that is not mutated by later edits", () => {
    const snapshot = state("A");
    rememberUndo("p1", "Closed Dashboard", snapshot);
    snapshot.collapsedPanels.push("/tasks");
    expect(takeUndo("p1")?.state.collapsedPanels).toEqual([]);
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/undo.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/dock/undo"`.

**Create `src/lib/dock/undo.ts`:**

```ts
/**
 * In-memory undo history for dock mutations that a user cannot see coming:
 * closing a panel, resetting a workspace, deleting a workspace.
 *
 * Deliberately NOT persisted (undo across an app restart is a different
 * feature) and deliberately NOT part of ProjectDockState (it must never be
 * serialized). One ring per project, newest last, vanishing beyond 10 steps;
 * snapshots are structurally cloned on write, so neither a later dock reducer
 * nor a caller still holding the previous state can corrupt what undo restores.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { ProjectDockState } from "./types";

export interface UndoEntry {
  /** Human label used in the toast: "Closed Task Boards". */
  label: string;
  /** When it was recorded (ms epoch). */
  at: number;
  /** The full project dock state before the mutation. */
  state: ProjectDockState;
}

/** How many steps a project can undo. */
export const MAX_UNDO = 10;

const HISTORY = new Map<string, UndoEntry[]>();

/** Structural clone — a snapshot must never alias the caller's live state. */
function cloneState(state: ProjectDockState): ProjectDockState {
  return typeof structuredClone === "function"
    ? structuredClone(state)
    : (JSON.parse(JSON.stringify(state)) as ProjectDockState);
}

/** Record `state` as the state to return to (cloned, so later edits cannot reach it). */
export function rememberUndo(
  projectId: string,
  label: string,
  state: ProjectDockState,
  at: number = Date.now(),
): void {
  const stack = HISTORY.get(projectId) ?? [];
  stack.push({ label, at, state: cloneState(state) });
  if (stack.length > MAX_UNDO) stack.splice(0, stack.length - MAX_UNDO);
  HISTORY.set(projectId, stack);
}

/** The next entry that `takeUndo` would return, without consuming it. */
export function peekUndo(projectId: string): UndoEntry | null {
  const stack = HISTORY.get(projectId);
  return stack && stack.length > 0 ? stack[stack.length - 1] : null;
}

/** Consume and return the newest entry, or null when there is none. */
export function takeUndo(projectId: string): UndoEntry | null {
  const stack = HISTORY.get(projectId);
  if (!stack || stack.length === 0) return null;
  const entry = stack.pop() as UndoEntry;
  if (stack.length === 0) HISTORY.delete(projectId);
  return entry;
}

/** How many steps are available for a project. */
export function undoDepth(projectId: string): number {
  return HISTORY.get(projectId)?.length ?? 0;
}

/** Test/debug helper: drop one project's history, or all of it. */
export function clearUndo(projectId?: string): void {
  if (projectId) HISTORY.delete(projectId);
  else HISTORY.clear();
}
```

Run: `pnpm test -- tests/unit/lib/dock/undo.test.ts`
Expected: **PASS** — `Test Files 1 passed`, `Tests 4 passed`.

Now wire it into the store — `src/lib/stores/dock.ts`:
1. Add to the imports: `import { deleteWorkspace, exportLayout, importLayout, applyLayout, type LayoutFile } from "@/lib/dock/dock-core";` (merge into the existing import list) and `import { rememberUndo, takeUndo } from "@/lib/dock/undo";`, plus `import { getPageDef } from "@/lib/dock/registry";` and `import { pushToast } from "@/lib/stores/toast";` (T4 creates that module — **do T4 before this wiring, or land both in one commit**).
2. Add module-level helper above `useDockStore`:
```ts
/** Display label for a panel id — never a raw path in user-facing copy. */
function panelLabel(panelId: string): string {
  return getPageDef(panelId)?.label ?? pageIdOf(panelId);
}
```
(`pageIdOf` is already imported? No — add `pageIdOf` to the `@/lib/dock/types` type-import as a value import.)
3. Extend the `DockStore` interface:
```ts
  /** Undo the last destructive dock action (close / reset / delete workspace). */
  undo: () => void;
  /** Delete a named workspace (refused for the last one). */
  deleteWorkspace: (name: string) => void;
  /** The active workspace as a portable JSON layout file. */
  exportLayout: () => string;
  /** Install a layout file as a new workspace; returns the workspace name or null. */
  importLayout: (text: string) => string | null;
```
4. Replace `close` and `resetWorkspace`, and add the three new actions:
```ts
      close: (panelId) =>
        set((s) => {
          const id = s.activeProjectId;
          const before = id ? s.projects[id] : undefined;
          const next = update(s, (state) => closeEverywhere(state, panelId));
          if (id && before) {
            const label = panelLabel(panelId);
            rememberUndo(id, `Closed ${label}`, before);
            pushToast({
              title: `Closed ${label}`,
              description: "Reopen it any time from the command palette.",
              actionLabel: "Undo",
              onAction: () => useDockStore.getState().undo(),
            });
          }
          return next;
        }),

      undo: () =>
        set((s) => {
          const id = s.activeProjectId;
          if (!id) return {};
          const entry = takeUndo(id);
          if (!entry) return {};
          pushToast({ title: `Restored “${entry.label}”`, tone: "success" });
          return { projects: { ...s.projects, [id]: entry.state } };
        }),

      deleteWorkspace: (name) =>
        set((s) => {
          const id = s.activeProjectId;
          const before = id ? s.projects[id] : undefined;
          const next = update(s, (state) => deleteWorkspace(state, name));
          if (id && before && next.projects) {
            rememberUndo(id, `Deleted workspace ${name}`, before);
            pushToast({
              title: `Deleted workspace “${name}”`,
              actionLabel: "Undo",
              onAction: () => useDockStore.getState().undo(),
            });
          }
          return next;
        }),

      exportLayout: () => {
        const s = get();
        const state = s.activeProjectId ? s.projects[s.activeProjectId] : undefined;
        return state ? exportLayout(state) : "";
      },

      importLayout: (text) => {
        const layout = importLayout(text);
        if (!layout) return null;
        let installed: string | null = null;
        set((s) =>
          update(s, (state) => {
            const next = applyLayout(state, layout);
            installed = next.activeWorkspace;
            return next;
          }),
        );
        if (installed) {
          pushToast({
            title: `Imported layout as “${installed}”`,
            tone: "success",
          });
        }
        return installed;
      },

      resetWorkspace: () =>
        set((s) => {
          const id = s.activeProjectId;
          const before = id ? s.projects[id] : undefined;
          const next = update(s, (state) => {
            const preset = WORKSPACE_PRESETS[state.activeWorkspace];
            return resetWorkspace(
              state,
              preset ? cloneTree(preset.tree) : state.workspaces[state.activeWorkspace].tree,
            );
          });
          if (id && before) {
            rememberUndo(id, `Reset ${before.activeWorkspace}`, before);
            pushToast({
              title: `Reset “${before.activeWorkspace}” to its preset`,
              actionLabel: "Undo",
              onAction: () => useDockStore.getState().undo(),
            });
          }
          return next;
        }),
```
5. Verify nothing else broke: `pnpm typecheck` → exit 0.

Run: `pnpm test` → **PASS**, including the untouched `tests/unit/lib/stores/dock.test.ts` (15 tests) — those assert dock state only, and the toast store is separate.

Commit: `feat(dock): undo for close/reset/delete + delete/export/import workspace actions`

---

## P8.T4 — Toasts with undo (pure queue, TDD, ≈8 min)

**Create `tests/unit/ui/toast-queue.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TTL_MS,
  MAX_VISIBLE,
  dismiss,
  enqueue,
  nextExpiry,
  prune,
  type Toast,
} from "@/lib/ui/toast-queue";

function toast(id: string, createdAt = 0, ttlMs = DEFAULT_TTL_MS): Toast {
  return { id, title: id, createdAt, ttlMs, tone: "default" };
}

describe("toast queue", () => {
  it("keeps the newest MAX_VISIBLE toasts", () => {
    let list: Toast[] = [];
    for (const id of ["a", "b", "c", "d"]) list = enqueue(list, toast(id));
    expect(list.map((t) => t.id)).toEqual(["b", "c", "d"]);
    expect(MAX_VISIBLE).toBe(3);
  });

  it("dismisses by id and ignores unknown ids", () => {
    const list = [toast("a"), toast("b")];
    expect(dismiss(list, "a").map((t) => t.id)).toEqual(["b"]);
    expect(dismiss(list, "zzz")).toHaveLength(2);
  });

  it("prunes only what has actually expired", () => {
    const list = [toast("old", 0, 1000), toast("fresh", 900, 1000)];
    expect(prune(list, 1500).map((t) => t.id)).toEqual(["fresh"]);
    expect(prune(list, 2500)).toEqual([]);
  });

  it("reports the next expiry so one timer is enough", () => {
    expect(nextExpiry([])).toBeNull();
    expect(nextExpiry([toast("a", 100, 500), toast("b", 0, 900)])).toBe(900);
  });
});
```

Run: `pnpm test -- tests/unit/ui/toast-queue.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/ui/toast-queue"`.

**Create `src/lib/ui/toast-queue.ts`:**

```ts
/**
 * Pure toast queue: append-with-cap, dismiss, expire. The zustand store
 * (src/lib/stores/toast.ts) is a thin wrapper, so all of the interesting
 * behaviour is testable in node.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

export type ToastTone = "default" | "success" | "danger";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone: ToastTone;
  createdAt: number;
  ttlMs: number;
}

/** How many toasts can be on screen at once (the oldest is dropped). */
export const MAX_VISIBLE = 3;
/** How long a toast stays unless dismissed. */
export const DEFAULT_TTL_MS = 6000;

export function enqueue(list: Toast[], toast: Toast): Toast[] {
  const next = [...list, toast];
  return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
}

export function dismiss(list: Toast[], id: string): Toast[] {
  return list.filter((toast) => toast.id !== id);
}

export function prune(list: Toast[], now: number): Toast[] {
  return list.filter((toast) => now - toast.createdAt < toast.ttlMs);
}

/** Absolute timestamp of the earliest expiry, or null when nothing is queued. */
export function nextExpiry(list: Toast[]): number | null {
  if (list.length === 0) return null;
  return Math.min(...list.map((toast) => toast.createdAt + toast.ttlMs));
}
```

Run: `pnpm test -- tests/unit/ui/toast-queue.test.ts`
Expected: **PASS** — `Test Files 1 passed`, `Tests 4 passed`.

**Create `src/lib/stores/toast.ts`:**

```ts
"use client";

/**
 * Transient toast store. One module-level timer drives expiry for the whole
 * queue (MAX_VISIBLE toasts, see toast-queue.ts). Never persisted: a toast
 * describes something that just happened in this session.
 */

import { create } from "zustand";
import { newId } from "@/lib/dock/types";
import {
  DEFAULT_TTL_MS,
  dismiss,
  enqueue,
  nextExpiry,
  prune,
  type Toast,
  type ToastTone,
} from "@/lib/ui/toast-queue";

export interface ToastInput {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: ToastTone;
  ttlMs?: number;
}

interface ToastStore {
  toasts: Toast[];
  /** Push a toast; returns its id. */
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(): void {
  if (timer) clearTimeout(timer);
  const expiry = nextExpiry(useToastStore.getState().toasts);
  if (expiry === null) return;
  timer = setTimeout(() => {
    useToastStore.setState((s) => ({ toasts: prune(s.toasts, Date.now()) }));
    schedule();
  }, Math.max(250, expiry - Date.now()));
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  push: (input) => {
    const id = newId("toast");
    const toast: Toast = {
      id,
      title: input.title,
      description: input.description,
      actionLabel: input.actionLabel,
      onAction: input.onAction,
      tone: input.tone ?? "default",
      createdAt: Date.now(),
      ttlMs: input.ttlMs ?? DEFAULT_TTL_MS,
    };
    set((s) => ({ toasts: enqueue(s.toasts, toast) }));
    schedule();
    return id;
  },

  dismiss: (id) => {
    set((s) => ({ toasts: dismiss(s.toasts, id) }));
    schedule();
  },

  clear: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ toasts: [] });
  },
}));

/** Imperative helper for non-component callers (the dock store). */
export function pushToast(input: ToastInput): string {
  return useToastStore.getState().push(input);
}
```

**Create `src/components/ui/toaster.tsx`:**

```tsx
"use client";

/**
 * Toast stack: bottom-right, above the floating nav dock, announced politely
 * to screen readers. Renders nothing when empty.
 */

import { Undo2, X } from "lucide-react";
import { useToastStore } from "@/lib/stores/toast";
import { cn } from "@/lib/utils/cn";

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-28 z-[60] flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-popover p-3 text-sm shadow-xl",
            toast.tone === "danger" && "border-destructive/40",
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">{toast.title}</p>
            {toast.description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{toast.description}</p>
            ) : null}
          </div>
          {toast.onAction && toast.actionLabel ? (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                dismiss(toast.id);
              }}
              className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
            >
              <Undo2 className="h-3 w-3" />
              {toast.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Dismiss notification: ${toast.title}`}
            onClick={() => dismiss(toast.id)}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

Mount it in `src/app/(workspace)/layout.tsx` next to `<GlobalSearch />` / `<ShortcutsDialog />`:

```tsx
      <Toaster />
```

(plus `import { Toaster } from "@/components/ui/toaster";`).

**Manual verification (2 min):** `pnpm dev` → open `http://localhost:3000/dashboard`, ensure the dock is on (Settings → Workspace → *Dock window manager*). Click the ✕ on the "Chat" tab → a toast appears bottom-right reading *Closed Chat* with an **Undo** button and a description; click **Undo** → the Chat tab returns in the same split. Repeat and let the toast expire after 6 s → it disappears on its own. Tab to the toast's ✕ (it must be reachable by keyboard) and press Enter.

Commit: `feat(ui): toast queue with undo affordances (pure queue + store + Toaster)`

---

## P8.T5 — A panel can crash without killing the dock (≈8 min)

**Create `src/components/dock/panel-loading.tsx`:**

```tsx
"use client";

/**
 * Panel loading state: a labelled skeleton instead of an anonymous spinner, so
 * a slow panel reads as "loading Task Boards", and screen readers hear it.
 */

export function PanelLoading({ label = "panel" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={`Loading ${label}`}
      className="flex h-full w-full flex-col gap-3 bg-background/50 p-4"
    >
      <div className="h-6 w-40 animate-pulse rounded bg-accent" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-accent/70" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-accent/70" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-accent/50" />
    </div>
  );
}
```

**Create `src/components/dock/panel-error.tsx`:**

```tsx
"use client";

/**
 * Crash isolation for dock panels. The dock is a window manager: one page
 * throwing must never take the shell (tabs, other splits, floaters) with it.
 * React has no hook-based equivalent, so this is the one class component in
 * the dock.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";

interface Props {
  panelId: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The dock has no logger; the console is the honest place for this.
    console.error(`[dock] panel ${this.props.panelId} crashed`, error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const label = getPageDef(this.props.panelId)?.label ?? pageIdOf(this.props.panelId);
    return (
      <div
        role="alert"
        className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <CircleAlert className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{label} stopped responding</p>
          <p className="max-w-md text-xs text-muted-foreground">
            The rest of the workspace is unaffected. Reload the panel, or close it and reopen it
            from the command palette. The technical detail is in the developer console.
          </p>
        </div>
        <p className="max-w-md truncate rounded border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload panel
        </button>
      </div>
    );
  }
}

/** A panel id with no component in PAGE_COMPONENTS (a nav entry without a route). */
export function PanelMissing({ panelId }: { panelId: string }) {
  const label = getPageDef(panelId)?.label ?? pageIdOf(panelId);
  return (
    <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
      <CircleAlert className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">{label} is not available in this build</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        It is listed in the sidebar but has no panel component. Close this panel or choose another
        one from the command palette.
      </p>
    </div>
  );
}
```

**Wire it in three places:**

1. `src/components/dock/panel-loader.tsx` — replace the local `loading()` and add the two new pages:
```tsx
import { PanelLoading } from "./panel-loading";

function loading() {
  return <PanelLoading />;
}
```
and add to `PAGE_COMPONENTS` (before the closing brace):
```tsx
  "/today": dynamic(() => import("@/app/(workspace)/today/page"), { ssr: false, loading }),
  "/tools/terminal": dynamic(() => import("@/app/(workspace)/tools/terminal/page"), { ssr: false, loading }),
  "/tools/logs": dynamic(() => import("@/app/(workspace)/tools/logs/page"), { ssr: false, loading }),
  "/tools/system": dynamic(() => import("@/app/(workspace)/tools/system/page"), { ssr: false, loading }),
```
(The four routes are created in T13/T14/T15/T16; create the route files as empty stubs in T16 if you run this task first, then `pnpm typecheck` — otherwise create them first.)

2. `src/components/dock/dock-group.tsx` — the `PanelTab` body:
```tsx
function PanelTab({ panelId, active }: { panelId: string; active: boolean }) {
  const Component = PAGE_COMPONENTS[pageIdOf(panelId)] ?? null;
  return (
    <PanelContent active={active}>
      {Component ? (
        <PanelErrorBoundary panelId={panelId}>
          <Component />
        </PanelErrorBoundary>
      ) : (
        <PanelMissing panelId={panelId} />
      )}
    </PanelContent>
  );
}
```
(imports: `import { PanelErrorBoundary, PanelMissing } from "./panel-error";`)

3. `src/components/dock/dock-workspace.tsx` `MaximizedPanel` and `src/components/dock/dock-floating-window.tsx`'s content block get the same wrapper (component + fallback).

**Create `tests/unit/_helpers/fs-scan.ts`** (the shared static-file reader used by this task, T16 and T24):

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read every source file under <repo>/src once. Static guard tests assert on
 * wiring TypeScript cannot see (registry ↔ component maps, loader entries,
 * forbidden APIs), so they must read the real files.
 *
 * `import.meta.url` (not __dirname) because the package is ESM ("type":
 * "module" in package.json) and vitest runs these suites as ESM.
 */
export interface SourceFile {
  /** Repo-relative POSIX path, e.g. "src/components/dock/panel-loader.tsx". */
  path: string;
  text: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");

export function readSources(dir = "src"): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      out.push({
        path: relative(ROOT, full).split(sep).join("/"),
        text: readFileSync(full, "utf8"),
      });
    }
  };
  walk(join(ROOT, dir));
  return out;
}
```
(from `tests/unit/_helpers/fs-scan.ts` the repo root is three levels up, so the helper is imported as `../../_helpers/fs-scan` from `tests/unit/lib/**` and as `./_helpers/fs-scan` from `tests/unit/*.test.ts`.)

**Create `tests/unit/lib/dock/panels-guard.test.ts` (static guard — it fails until the wiring below lands):**

```ts
import { describe, expect, it } from "vitest";
import { PAGE_PATHS } from "@/lib/dock/registry";
import { readSources } from "../../_helpers/fs-scan";

/**
 * Static guards over the dock's two registries. They exist because both are
 * hand-written text: a nav entry without a loader entry renders "not
 * available", and a loader entry without a loading state shows an empty box.
 */
const loader = () => readSources().find((s) => s.path === "src/components/dock/panel-loader.tsx");

describe("panel loader", () => {
  it("has a component for every dock page", () => {
    const source = loader()?.text ?? "";
    for (const path of PAGE_PATHS) {
      expect(source, path).toContain(`"${path}": dynamic(`);
    }
  });

  it("passes a loading state to every dynamic import", () => {
    const source = loader()?.text ?? "";
    const dynamicCount = source.match(/dynamic\(/g)?.length ?? 0;
    const loadingCount = source.match(/loading\s*[,}]/g)?.length ?? 0;
    expect(loadingCount).toBe(dynamicCount);
  });

  it("wraps panels in the error boundary", () => {
    const group = readSources().find((s) => s.path === "src/components/dock/dock-group.tsx");
    expect(group?.text ?? "").toContain("<PanelErrorBoundary panelId={panelId}>");
  });

  it("registers the Today view and the three tool panels", () => {
    const source = loader()?.text ?? "";
    for (const path of ["/today", "/tools/terminal", "/tools/logs", "/tools/system"]) {
      expect(source, path).toContain(`"${path}": dynamic(`);
    }
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/panels-guard.test.ts`
Expected: **FAIL** — `expected … to contain '"/today": dynamic('` (the four new pages are not registered yet; the guard is doing its job), then **PASS** — `Tests 4 passed` after the loader edit below.

**Manual verification (2 min):** temporarily add `throw new Error("boom")` at the top of `src/components/settings/settings-view.tsx`'s render (or any page component), open `/settings` in a dock panel → the panel shows *Settings stopped responding* with a **Reload panel** button; the tab strip, other splits and the palette still work. Remove the throw.

Commit: `feat(dock): isolate panel crashes and give panels a labelled loading state`

---

## P8.T6 — Predictable tab overflow + keyboard tabs (pure + UI, TDD, ≈10 min)

**Create `tests/unit/lib/dock/overflow.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { TAB_MENU_THRESHOLD, shouldUseTabMenu, tabCounts } from "@/lib/dock/overflow";

describe("tabCounts", () => {
  it("reports how many tabs sit before and after the active one", () => {
    expect(tabCounts(5, 0)).toEqual({ before: 0, after: 4 });
    expect(tabCounts(5, 2)).toEqual({ before: 2, after: 2 });
    expect(tabCounts(5, 4)).toEqual({ before: 4, after: 0 });
  });

  it("clamps out-of-range indexes and handles an empty strip", () => {
    expect(tabCounts(3, 9)).toEqual({ before: 2, after: 0 });
    expect(tabCounts(3, -4)).toEqual({ before: 0, after: 2 });
    expect(tabCounts(0, 0)).toEqual({ before: 0, after: 0 });
  });
});

describe("shouldUseTabMenu", () => {
  it("switches to the menu only for genuinely crowded strips", () => {
    expect(TAB_MENU_THRESHOLD).toBe(8);
    expect(shouldUseTabMenu(7)).toBe(false);
    expect(shouldUseTabMenu(8)).toBe(true);
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/overflow.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/dock/overflow"`.

**Create `src/lib/dock/overflow.ts`:**

```ts
/**
 * Tab-strip presentation math. A dock group can hold any number of panels;
 * the strip scrolls, the active tab is always scrolled into view, and past
 * TAB_MENU_THRESHOLD the group also offers an explicit "All tabs" menu so no
 * panel is ever unreachable (the user's rule: nothing hidden, everything
 * discoverable).
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

/** Above this many tabs in one group, show the "All tabs (N)" menu as well. */
export const TAB_MENU_THRESHOLD = 8;

/** How many tabs are to the left/right of the active one. */
export function tabCounts(
  count: number,
  activeIndex: number,
): { before: number; after: number } {
  if (count <= 0) return { before: 0, after: 0 };
  const active = Math.max(0, Math.min(activeIndex, count - 1));
  return { before: active, after: count - 1 - active };
}

/** True when the strip is crowded enough to also offer the overflow menu. */
export function shouldUseTabMenu(count: number): boolean {
  return count >= TAB_MENU_THRESHOLD;
}
```

Run: `pnpm test -- tests/unit/lib/dock/overflow.test.ts`
Expected: **PASS** — `Tests 3 passed`.

**`src/components/dock/tab-menu.tsx` (new):**

```tsx
"use client";

/**
 * "All tabs (N)" menu: the always-visible list of every panel in a crowded
 * group, with a close button per row. Rendered only when a group passes
 * TAB_MENU_THRESHOLD, next to the group action menu.
 */

import { X } from "lucide-react";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";
import { useDockStore } from "@/lib/stores/dock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

export function TabMenu({
  pages,
  activePage,
}: {
  pages: string[];
  activePage: string;
}) {
  const focus = useDockStore((s) => s.focus);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer">
        <span
          role="button"
          aria-label={`All tabs in this group (${pages.length})`}
          title={`All tabs (${pages.length})`}
          className="flex h-6 items-center rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          All tabs ({pages.length})
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Panels in this group</DropdownMenuLabel>
        {pages.map((panelId) => {
          const def = getPageDef(panelId);
          const Icon = def?.icon;
          const active = panelId === activePage;
          return (
            <DropdownMenuItem
              key={panelId}
              active={active}
              onSelect={() => focus(panelId)}
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              <span className={cn("truncate", active && "font-medium")}>
                {def?.label ?? pageIdOf(panelId)}
              </span>
              <X
                aria-label={`Close ${def?.label ?? panelId}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    useDockStore.getState().close(panelId);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  useDockStore.getState().close(panelId);
                }}
                className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-destructive"
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Edit `src/components/dock/dock-group.tsx` — the tab strip becomes keyboard-operable, scrollable and overflow-aware.** Replace the strip block (`<div role="tablist" …>` … `</div>` up to the group actions container) with:

```tsx
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Dock panel tabs"
        className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border bg-sidebar/40 px-1.5"
        onKeyDown={onStripKeyDown}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPointerDown={(e) => {
            // Dragging the empty strip area moves the whole group. The scroll
            // container is the element that actually receives those clicks now
            // that the tabs live inside it.
            if (e.target === e.currentTarget) startTabDrag(e, activePage);
          }}
        >
          {pages.map((panelId) => {
            const def = getPageDef(panelId);
            const Icon = def?.icon;
            const active = panelId === activePage;
            return (
              <TabActionsMenu key={panelId} panelId={panelId} groupNodeId={node.id} pages={pages}>
              <div
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                ref={active ? activeTabRef : undefined}
                onKeyDown={(e) => onTabKeyDown(e, panelId)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  startTabDrag(e, panelId);
                  if (!active) focus(panelId);
                }}
                className={cn(
                  "group/tab flex h-7 max-w-44 shrink-0 cursor-grab items-center gap-1.5 rounded-md px-2 text-xs transition-colors select-none",
                  active
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
                <span className="truncate">{def?.label ?? pageIdOf(panelId)}</span>
                {/* …unchanged close button… */}
              </div>
              </TabActionsMenu>
            );
          })}
        </div>

        {shouldUseTabMenu(pages.length) ? (
          <TabMenu pages={pages} activePage={activePage} />
        ) : null}

        {/* …unchanged group actions dropdown, then: */}
```

with, inside `DockGroup`, above the `return`:

```tsx
  const activeTabRef = useRef<HTMLDivElement>(null);
  const counts = tabCounts(pages.length, pages.indexOf(activePage));

  // WAI-ARIA tabs pattern: ←/→ move between tabs, Home/End jump, Delete closes.
  function onTabKeyDown(e: React.KeyboardEvent, panelId: string): void {
    const index = pages.indexOf(panelId);
    if (e.key === "ArrowRight") focus(pages[(index + 1) % pages.length]);
    else if (e.key === "ArrowLeft") focus(pages[(index - 1 + pages.length) % pages.length]);
    else if (e.key === "Home") focus(pages[0]);
    else if (e.key === "End") focus(pages[pages.length - 1]);
    else if (e.key === "Delete") close(panelId);
    else return;
    e.preventDefault();
  }

  // The strip itself is not focusable; keys are handled on the active tab.
  function onStripKeyDown(): void {
    /* no-op: kept so the strip owns one handler for future keys */
  }
```

and the scroll-into-view effect:

```tsx
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePage, pages.length]);
```

plus the indicator chips next to the strip (before the group-actions block), which is what `tabCounts` is for:

```tsx
        {counts.before > 0 ? (
          <span className="shrink-0 px-1 text-[10px] text-muted-foreground" aria-hidden>
            ‹ {counts.before}
          </span>
        ) : null}
        {counts.after > 0 ? (
          <span className="shrink-0 px-1 text-[10px] text-muted-foreground" aria-hidden>
            {counts.after} ›
          </span>
        ) : null}
```

**Create `src/components/dock/right-click-menu.tsx`** — the tab context menu. Until now the dock's vocabulary was split between a visible strip and hidden gestures; the verbs a user cannot guess (split, float, collapse) need a place to be found:

```tsx
"use client";

/**
 * Tab context menu — the discoverable path to the rest of the dock's verbs.
 *
 * The tab itself already carries drag, close and keyboard focus. Everything the
 * dock can otherwise do to a panel (float it, split it out, maximize, collapse
 * the group, close the others) lived only in a hidden gesture or not at all;
 * a right-click is where a Windows user looks for it.
 *
 * Every item calls exactly one existing store action — the menu owns no state
 * beyond "am I open", and it invents no new dock capability.
 */

import type { ReactNode } from "react";
import {
  AppWindow,
  Columns2,
  Maximize2,
  PanelBottomClose,
  Rows2,
  Trash2,
  X,
} from "lucide-react";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";
import { useDockStore } from "@/lib/stores/dock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  useDropdown,
} from "@/components/ui/dropdown-menu";

export interface TabActionsMenuProps {
  panelId: string;
  /** The group's node id — the target the split items move the panel beside. */
  groupNodeId: string;
  /** Every page in the group, for "Close the other panels". */
  pages: string[];
  children: ReactNode;
}

/**
 * Opens the menu on right-click only.
 *
 * `DropdownMenuTrigger` toggles on click, which would fire on every tab click,
 * and `DropdownMenu` has no `open` prop — so this uses the trigger hook the UI
 * kit exports (`useDropdown`). Chromium dispatches `contextmenu` for Shift+F10
 * and the menu key on a focused element, so the menu is keyboard-reachable too.
 * On a touch/pen device, long-press does NOT fire it: the same items are also
 * reachable from the keyboard shortcuts in the shortcuts dialog.
 */
function ContextArea({ children }: { children: ReactNode }) {
  const { setOpen } = useDropdown();
  return (
    <div
      className="contents"
      onContextMenu={(event) => {
        event.preventDefault();
        setOpen(true);
      }}
    >
      {children}
    </div>
  );
}

/** Floating windows cascade so two of them never land exactly on top of each other. */
const FLOAT_ORIGIN = { x: 160, y: 120 };
const FLOAT_CASCADE = 24;

export function TabActionsMenu({ panelId, groupNodeId, pages, children }: TabActionsMenuProps) {
  const label = getPageDef(panelId)?.label ?? pageIdOf(panelId);
  const others = pages.filter((page) => page !== panelId);

  return (
    <DropdownMenu>
      <ContextArea>{children}</ContextArea>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            const dock = useDockStore.getState();
            const index = dock.getProject()?.floaters.length ?? 0;
            dock.float(panelId, {
              x: FLOAT_ORIGIN.x + index * FLOAT_CASCADE,
              y: FLOAT_ORIGIN.y + index * FLOAT_CASCADE,
            });
          }}
        >
          <AppWindow className="h-4 w-4" /> Float as a window
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => useDockStore.getState().move(panelId, groupNodeId, "right")}
        >
          <Columns2 className="h-4 w-4" /> Split right
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => useDockStore.getState().move(panelId, groupNodeId, "bottom")}
        >
          <Rows2 className="h-4 w-4" /> Split down
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => useDockStore.getState().toggleMaximize(panelId)}>
          <Maximize2 className="h-4 w-4" /> Maximize or restore
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => useDockStore.getState().toggleCollapse(panelId)}>
          <PanelBottomClose className="h-4 w-4" /> Collapse to the taskbar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => useDockStore.getState().close(panelId)}>
          <X className="h-4 w-4" /> Close
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => {
            const dock = useDockStore.getState();
            for (const page of others) dock.close(page);
          }}
        >
          <Trash2 className="h-4 w-4" /> Close the other {others.length} panels
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

(Naming: the file is `right-click-menu.tsx` because that is the gesture; the component is `TabActionsMenu`, which is what it acts on. README-level note for the shortcuts dialog is in T23.)

New imports for the file: `useEffect, useRef` from react, `TabMenu` from `./tab-menu`, `TabActionsMenu` from `./right-click-menu`, `shouldUseTabMenu, tabCounts` from `@/lib/dock/overflow`.

**Manual verification (4 min, exact):**
1. `pnpm dev`, open `/dashboard`, then open `/brain`, `/tasks`, `/docs`, `/specs`, `/chat` from the palette (`⌘/Ctrl+K`, type the name, Enter). Then drag the `/docs` tab onto the *tab strip* of the group that holds `/tasks` → the group now has 2 tabs and shows no indicators.
2. Add 6 more panels to that group (palette → Enter each time, then drag its tab onto that strip). With 8 tabs: the strip scrolls horizontally, the *All tabs (8)* control appears at the right, the active tab is always visible, and `‹ N` / `N ›` counts sit next to the strip while tabs are out of view.
3. Focus the active tab (click it) and press `→` / `←`: the active tab changes and the strip follows. `Home` / `End` jump to the first/last. `Delete` closes the focused tab. The closed tab is undoable from the toast.
4. Open *All tabs (8)*: every panel is listed; clicking one focuses it; the ✕ on a row closes it.
5. Narrow the window to ~1200 px and repeat step 2: nothing is clipped without an affordance, and no horizontal scrollbar appears on the page body.
6. Right-click a tab: the menu appears anchored to that tab and lists *Float as a window*, *Split right*, *Split down*, *Maximize or restore*, *Collapse to the taskbar*, *Close*, *Close the other N panels*.
7. Click *Split right*: that panel moves into a new column to the right and the strip keeps the remaining tabs. Right-click again and click *Close the other N panels*: only that panel remains in the group.
8. Focus a tab with the keyboard and press `Shift+F10` (or the menu key): the same menu opens — that is how the menu is reachable without a mouse.

Cheap automated assertion for the same behaviour lives in `tests/unit/lib/dock/overflow.test.ts` (T6 header). Commit: `feat(dock): scrollable keyboard tab strips, an all-tabs menu, and a right-click menu for every dock verb`

---

## P8.T7 — Drag & drop validation: a refused drop never teleports or deletes a panel (pure, TDD, ≈12 min)

**Create `tests/unit/lib/dock/dropguard.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import type { DockNode } from "@/lib/dock/types";
import { dropVerdict, draggedNodeId, draggedPanels } from "@/lib/dock/dropguard";
import { movePanel, collectPages, normalizeTree } from "@/lib/dock/tree";

const page = (id: string, pageId: string): DockNode => ({ type: "page", id, pageId });
const tabs = (id: string, pages: string[]): DockNode => ({
  type: "tabs",
  id,
  activePage: pages[0],
  pages,
});
const split = (id: string, a: DockNode, b: DockNode, ratio = 0.5): DockNode => ({
  type: "split",
  id,
  direction: "horizontal",
  ratio,
  children: [a, b],
});

/** left | right  —  right holds a 2-page group. */
function tree(): DockNode {
  return split("s1", page("pl", "/tasks"), tabs("tr", ["/brain", "/docs"]));
}

describe("draggedPanels / draggedNodeId", () => {
  it("a panel in a multi-page group moves the whole group", () => {
    expect(draggedPanels(tree(), { kind: "panel", panelId: "/brain" })).toEqual(["/brain", "/docs"]);
    expect(draggedNodeId(tree(), { kind: "panel", panelId: "/brain" })).toBe("tr");
  });

  it("a lone page moves itself", () => {
    expect(draggedPanels(tree(), { kind: "panel", panelId: "/tasks" })).toEqual(["/tasks"]);
    expect(draggedNodeId(tree(), { kind: "panel", panelId: "/tasks" })).toBe("pl");
  });

  it("knows nothing about floaters or unknown panels", () => {
    expect(draggedPanels(tree(), { kind: "floater", floaterId: "f1" })).toEqual([]);
    expect(draggedPanels(tree(), { kind: "panel", panelId: "/nope" })).toEqual([]);
    expect(draggedNodeId(tree(), { kind: "panel", panelId: "/nope" })).toBeNull();
  });
});

describe("dropVerdict", () => {
  const source = { kind: "panel", panelId: "/tasks" } as const;

  it("accepts the root and a sibling group", () => {
    expect(dropVerdict(tree(), source, "root", "left").ok).toBe(true);
    expect(dropVerdict(tree(), source, "tr", "right").ok).toBe(true);
    expect(dropVerdict(tree(), source, "tr", "tab").ok).toBe(true);
  });

  it("refuses nothing at all", () => {
    expect(dropVerdict(tree(), source, null, null)).toEqual({
      ok: false,
      reason: "Release over free space or a drop zone.",
    });
    expect(dropVerdict(tree(), source, "outside", "left").ok).toBe(false);
  });

  it("refuses a stale target (the layout changed mid-drag)", () => {
    const verdict = dropVerdict(tree(), source, "gone", "left");
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toContain("layout changed");
  });

  it("refuses a split target — committing it would delete the panel", () => {
    const verdict = dropVerdict(tree(), source, "s1", "left");
    expect(verdict.ok).toBe(false);

    // Characterization of WHY: movePanel skips split targets and returns the
    // tree without re-inserting the payload, so the panel vanishes.
    expect(collectPages(movePanel(tree(), "/tasks", "s1", "left"))).toEqual(["/brain", "/docs"]);
  });

  it("refuses dropping a panel onto its own group", () => {
    const edge = dropVerdict(tree(), { kind: "panel", panelId: "/tasks" }, "pl", "left");
    expect(edge.ok).toBe(false);
    expect(edge.ok === false && edge.reason).toContain("cannot be docked next to itself");

    const tab = dropVerdict(tree(), { kind: "panel", panelId: "/brain" }, "tr", "tab");
    expect(tab.ok).toBe(false);
    expect(tab.ok === false && tab.reason).toContain("already in this group");
  });

  it("accepts a tab merge that would actually add a panel", () => {
    expect(dropVerdict(tree(), { kind: "panel", panelId: "/tasks" }, "tr", "tab").ok).toBe(true);
  });

  it("refuses a no-op tab merge from a group drag that changes nothing", () => {
    const whole = { kind: "group", nodeId: "tr" } as const;
    const verdict = dropVerdict(tree(), whole, "tr", "tab");
    expect(verdict.ok).toBe(false);
  });

  it("accepts a floater landing on a tab strip, known or unknown payload", () => {
    expect(
      dropVerdict(tree(), { kind: "floater", floaterId: "f1", panelIds: ["/chat"] }, "tr", "tab").ok,
    ).toBe(true);
    expect(dropVerdict(tree(), { kind: "floater", floaterId: "f2" }, "tr", "tab").ok).toBe(true);
  });

  it("keeps layout pages intact for every accepted drop", () => {
    const before = collectPages(tree()).sort();
    for (const zone of ["left", "right", "top", "bottom"] as const) {
      const after = collectPages(normalizeTree(movePanel(tree(), "/tasks", "tr", zone))).sort();
      expect(after).toEqual(before);
    }
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/dropguard.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/dock/dropguard"` (and the characterization assertion `expected [ '/brain', '/docs' ]` proves the data-loss path exists).

**Create `src/lib/dock/dropguard.ts`:**

```ts
/**
 * Drop validation for the dock's pointer drag & drop.
 *
 * The reducers in tree.ts are forgiving by design (a stale target falls back
 * to a root insert so no page is ever lost); the UI must not *offer* a drop
 * whose outcome would surprise the user. This module is the single judge:
 * the workspace asks it before highlighting a target, and the DnD controller
 * asks it again before committing.
 *
 * Refused drops:
 * - no target / "outside": the pointer is not over the workspace
 * - stale target: the node id is not in the current tree
 * - split target: movePanel skips split targets, so committing would return
 *   the tree WITHOUT the payload (the panel disappears from the layout)
 * - self: the target is the dragged group itself — an edge drop there lands in
 *   movePanel's root fallback (silent position loss), a tab drop is a no-op
 * - no-op tab merge: the target group already holds every dragged page
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode, DockZone } from "./types";
import { findHolder, findNode } from "./tree";

export type DropSource =
  | { kind: "panel"; panelId: string; nodeId?: string }
  | { kind: "group"; nodeId: string }
  | { kind: "floater"; floaterId: string; panelIds?: string[] };

export type DropVerdict = { ok: true } | { ok: false; reason: string };

const OK: DropVerdict = { ok: true };

/** The group a drag would move out of the tree, or null. */
function sourceGroup(tree: DockNode, source: DropSource): DockNode | null {
  if (source.kind === "floater") return null;
  const node =
    source.kind === "panel" ? findHolder(tree, source.panelId) : findNode(tree, source.nodeId);
  if (!node || node.type === "split") return null;
  return node;
}

/** Every panel the drag would move (a multi-page group moves as a whole). */
export function draggedPanels(tree: DockNode, source: DropSource): string[] {
  const group = sourceGroup(tree, source);
  if (!group) return [];
  return group.type === "tabs" ? [...group.pages] : [group.pageId];
}

/** The node id the drag would remove from the tree, or null. */
export function draggedNodeId(tree: DockNode, source: DropSource): string | null {
  return sourceGroup(tree, source)?.id ?? null;
}

/** Decide whether a drop may be committed. */
export function dropVerdict(
  tree: DockNode,
  source: DropSource,
  targetId: string | null,
  zone: DockZone | null,
): DropVerdict {
  if (!targetId || !zone) {
    return { ok: false, reason: "Release over free space or a drop zone." };
  }
  if (targetId === "outside") {
    return { ok: false, reason: "Dropped outside the workspace." };
  }
  if (targetId === "root") return OK;

  const node = findNode(tree, targetId);
  if (!node) {
    return { ok: false, reason: "The layout changed during the drag — try again." };
  }
  if (node.type === "split") {
    return { ok: false, reason: "Drop on a panel or its tabs, not on a divider." };
  }

  const self = draggedNodeId(tree, source);
  if (self && self === targetId) {
    return {
      ok: false,
      reason:
        zone === "tab"
          ? "These panels are already in this group."
          : "A panel cannot be docked next to itself.",
    };
  }

  if (zone === "tab") {
    // A floater's payload is carried by the drag ({panelIds}); a tree drag's
    // payload is derived from the tree. An unknown-but-non-empty payload is
    // accepted — the reducer dedupes pages anyway.
    const dragged =
      source.kind === "floater" ? (source.panelIds ?? []) : draggedPanels(tree, source);
    if (source.kind !== "floater" && dragged.length === 0) {
      return { ok: false, reason: "Nothing to move." };
    }
    const targetPages = node.type === "tabs" ? node.pages : [node.pageId];
    if (dragged.length > 0 && dragged.every((panelId) => targetPages.includes(panelId))) {
      return { ok: false, reason: "These panels are already in this group." };
    }
  }

  return OK;
}
```

Run: `pnpm test -- tests/unit/lib/dock/dropguard.test.ts`
Expected: **PASS** — `Tests 13 passed`.

**Wire it into three files:**

1. `src/lib/stores/dock.ts` — extend the transient drag state (types only, never persisted):
```ts
export interface DockDragState {
  source: DragSource;
  pointer: { x: number; y: number };
  /** Zone under the pointer, or null when over no drop target. */
  zone: DockZone | null;
  /** Node id (or "root"/"outside") under the pointer, when applicable. */
  targetId: string | null;
  /** Why the last candidate target was refused, for the overlay hint. */
  refused: string | null;
}
```
(and add `refused: null` to both `setDrag` payloads in `use-dock-dnd.tsx:148-153,163-168`.)

2. `src/components/dock/dock-workspace.tsx` — hit-test runs the verdict; root marker added:
```tsx
      const tree = projectState.workspaces[projectState.activeWorkspace].tree;
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-dock-node]"),
      );
      let hit: { id: string; zone: ReturnType<typeof zoneForPoint>; refused: string | null } | null = null;
      for (const node of nodes) {
        const box = node.getBoundingClientRect();
        const r: Rect = { x: box.left, y: box.top, width: box.width, height: box.height };
        if (
          e.clientX >= r.x &&
          e.clientX <= r.x + r.width &&
          e.clientY >= r.y &&
          e.clientY <= r.y + r.height
        ) {
          const z = zoneForPoint(r, e.clientX, e.clientY);
          const id = node.dataset.dockNode as string;
          const verdict = dropVerdict(tree, drag.source, id, z);
          hit = { id, zone: verdict.ok ? z : null, refused: verdict.ok ? null : verdict.reason };
          if (verdict.ok && z === "tab") break; // most specific valid target wins
        }
      }

      const nextZone = hit?.zone ?? null;
      const nextTarget = hit ? hit.id : null;
      const nextRefused = hit?.refused ?? null;
      if (
        drag.zone !== nextZone ||
        drag.targetId !== nextTarget ||
        drag.refused !== nextRefused
      ) {
        setDrag({ ...drag, zone: nextZone, targetId: nextTarget, refused: nextRefused });
      }
```
and the container gains a stable hook for keyboard focus movement (T9):
```tsx
    <div
      ref={containerRef}
      data-dock-workspace=""
      onPointerMove={onPointerMove}
      className="relative h-full w-full overflow-hidden"
    >
```
(import `dropVerdict` from `@/lib/dock/dropguard`)

3. `src/components/dock/use-dock-dnd.tsx` — the commit path refuses refused drops:
```ts
      const { source, zone, targetId, refused } = d;
      // A refusal is final for this release: never fall through to "float".
      if (refused) return;
```
immediately after the `dist < 4` click guard, and for groups/panels wrap the commit in a verdict re-check (the tree may have changed between highlight and release):
```ts
      const current = useDockStore.getState();
      const state = current.activeProjectId ? current.projects[current.activeProjectId] : undefined;
      const tree = state?.workspaces[state.activeWorkspace].tree;
      if (tree && targetId && zone && !dropVerdict(tree, source, targetId, zone).ok) return;
```
placed just before each `s.move(...)` / `s.dockFloater(...)` call.

4. `src/components/dock/dock-overlay.tsx` — show the refusal where the user is looking:
```tsx
      {drag.refused ? (
        <div
          className="absolute flex items-center gap-1.5 rounded-md border border-destructive/50 bg-popover px-2 py-1 text-xs font-medium text-destructive shadow-lg"
          style={{
            left: drag.pointer.x - workspaceRect.x + 12,
            top: drag.pointer.y - workspaceRect.y + 12,
          }}
        >
          {drag.refused}
        </div>
      ) : null}
```
(rendered before the existing zone chip; keep the chip unchanged.)

**Manual verification (3 min, exact):** `pnpm dev` → `/dashboard`. Grab the *Task Boards* tab and hold it still over its own strip: no accent preview appears and releasing changes nothing (before P8 this decorated the layout by teleporting the panel to the root). Drag it to the right half of the Dashboard panel: the accent preview appears labelled *Task Boards → Dock right*; release → the split happens and no toast about a closed panel appears. Drag a floater onto the *divider line*: the overlay shows *Drop on a panel or its tabs, not on a divider.* Release → nothing happens, the floater stays where it is. Press `Escape` mid-drag → drag cancels (unchanged).

Commit: `feat(dock): validate drops (stale/self/split/no-op) before committing them`

---

## P8.T8 — Keyboard and screen-reader support for split resizing (pure + UI, TDD, ≈6 min)

**Create `tests/unit/lib/dock/resize-key.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { resizeDelta } from "@/lib/dock/geometry";

describe("resizeDelta", () => {
  it("shrinks with Left/Up and grows with Right/Down in the matching direction", () => {
    expect(resizeDelta("ArrowLeft", "horizontal")).toBe(-0.02);
    expect(resizeDelta("ArrowRight", "horizontal")).toBe(0.02);
    expect(resizeDelta("ArrowUp", "vertical")).toBe(-0.02);
    expect(resizeDelta("ArrowDown", "vertical")).toBe(0.02);
  });

  it("ignores the axis it does not resize", () => {
    expect(resizeDelta("ArrowUp", "horizontal")).toBeNull();
    expect(resizeDelta("ArrowLeft", "vertical")).toBeNull();
  });

  it("uses a coarse step with Shift and the limits with Home/End", () => {
    expect(resizeDelta("ArrowRight", "horizontal", true)).toBe(0.1);
    expect(resizeDelta("Home", "horizontal")).toBe(-1);
    expect(resizeDelta("End", "horizontal")).toBe(1);
  });

  it("ignores every other key", () => {
    expect(resizeDelta("Enter", "horizontal")).toBeNull();
    expect(resizeDelta("a", "horizontal")).toBeNull();
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/resize-key.test.ts`
Expected: **FAIL** — `TypeError: resizeDelta is not a function`.

**Append to `src/lib/dock/geometry.ts`:**

```ts
/**
 * Keyboard resize step for a split divider (WAI-ARIA window-splitter pattern).
 * Left/Up shrink the first pane, Right/Down grow it; Shift = coarse (10%);
 * Home/End jump to the clamp limits. Null when the key does not resize.
 */
export function resizeDelta(
  key: string,
  direction: "horizontal" | "vertical",
  shift = false,
): number | null {
  const normalized = key.toLowerCase();
  const step = shift ? 0.1 : 0.02;
  const [shrink, grow] =
    direction === "horizontal"
      ? ["arrowleft", "arrowright"]
      : ["arrowup", "arrowdown"];
  if (normalized === shrink) return -step;
  if (normalized === grow) return step;
  if (normalized === "home") return -1;
  if (normalized === "end") return 1;
  return null;
}
```

Run: `pnpm test -- tests/unit/lib/dock/resize-key.test.ts`
Expected: **PASS** — `Tests 4 passed`.

**Replace `src/components/dock/split-divider.tsx` with:**

```tsx
"use client";

/**
 * Draggable split divider. Live-resizes the owning split via pointer capture;
 * double-click resets to 50/50; Arrow keys (Shift = coarse, Home/End = limit)
 * resize it from the keyboard, and it exposes the ARIA window-splitter
 * attributes so the ratio is audible and testable. The ratio math uses the
 * parent split element's rect, so it works at any nesting depth.
 */

import { useCallback, useRef } from "react";
import { MIN_RATIO, MAX_RATIO } from "@/lib/dock/types";
import { clampRatio, resizeDelta } from "@/lib/dock/geometry";
import { useDockStore } from "@/lib/stores/dock";
import { cn } from "@/lib/utils/cn";

export function SplitDivider({
  direction,
  splitId,
  ratio,
}: {
  direction: "horizontal" | "vertical";
  splitId: string;
  /** Current share of the FIRST pane (0.05 – 0.95) — required for ARIA + keys. */
  ratio: number;
}) {
  const resize = useDockStore((s) => s.resize);
  const ref = useRef<HTMLDivElement>(null);
  const horizontal = direction === "horizontal";

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = ref.current;
      const parent = el?.parentElement;
      if (!el || !parent) return;
      const rect = parent.getBoundingClientRect();
      el.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const frac = horizontal
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
        resize(splitId, clampRatio(frac));
      };
      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [horizontal, resize, splitId],
  );

  return (
    <div
      ref={ref}
      role="separator"
      tabIndex={0}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label={horizontal ? "Resize columns" : "Resize rows"}
      aria-valuemin={Math.round(MIN_RATIO * 100)}
      aria-valuemax={Math.round(MAX_RATIO * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuetext={`${Math.round(ratio * 100)}% for the first pane`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resize(splitId, 0.5)}
      onKeyDown={(e) => {
        const delta = resizeDelta(e.key, direction, e.shiftKey);
        if (delta === null) return;
        e.preventDefault();
        resize(splitId, clampRatio(ratio + delta));
      }}
      title="Drag to resize · double-click for 50/50 · arrow keys to nudge"
      className={cn(
        "group relative z-10 shrink-0 bg-border transition-colors hover:bg-primary/60 focus-visible:bg-primary/60 focus-visible:outline-none",
        horizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      )}
    >
      {/* Wider invisible hit area: a 1px line is not a pointer target. */}
      <span
        aria-hidden
        className={cn(
          "absolute",
          horizontal ? "-left-1 -right-1 top-0 bottom-0" : "-top-1 -bottom-1 left-0 right-0",
        )}
      />
    </div>
  );
}
```

Then pass the ratio in `src/components/dock/dock-tree-view.tsx:61`:
```tsx
      <SplitDivider direction={node.direction} splitId={node.id} ratio={node.ratio} />
```

**Manual verification (1 min):** `pnpm dev` → `/dashboard` (preset Development is a horizontal split of Dashboard | Chat). Click the divider between them: it must show a focus ring. Press `→` ten times → the Chat pane grows by ~20%; `Shift+Home` → the first pane shrinks to its minimum (5%); `Shift+End` → 95%; double-click → back to 50%. Tab from the topbar until the divider receives focus (it is in the tab order).

Commit: `feat(dock): keyboard-resizable split dividers with ARIA window-splitter attributes`

---

## P8.T9 — Spatial focus movement + an Alt-based dock keymap (pure, TDD, ≈12 min)

**Create `tests/unit/lib/dock/nav-geo.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import type { DockNode } from "@/lib/dock/types";
import type { Rect } from "@/lib/dock/geometry";
import { focusTargetOf, layoutRects, neighborInDirection } from "@/lib/dock/nav-geo";

const page = (id: string, pageId: string): DockNode => ({ type: "page", id, pageId });
const tabs = (id: string, pages: string[]): DockNode => ({
  type: "tabs",
  id,
  activePage: pages[0],
  pages,
});
const split = (
  id: string,
  direction: "horizontal" | "vertical",
  a: DockNode,
  b: DockNode,
  ratio = 0.5,
): DockNode => ({ type: "split", id, direction, ratio, children: [a, b] });

const WORKSPACE: Rect = { x: 0, y: 0, width: 1000, height: 800 };

const twoUp = () => split("s1", "horizontal", page("left", "/tasks"), page("right", "/chat"));

describe("layoutRects", () => {
  it("splits the workspace rect by ratio for the leaves only", () => {
    const rects = layoutRects(twoUp(), WORKSPACE);
    expect(rects.get("left")).toEqual({ x: 0, y: 0, width: 500, height: 800 });
    expect(rects.get("right")).toEqual({ x: 500, y: 0, width: 500, height: 800 });
    expect(rects.has("s1")).toBe(false);
  });

  it("nests: a 25% first pane inside a 50% column", () => {
    const tree = split(
      "s1",
      "horizontal",
      split("s2", "vertical", page("a", "/a"), page("b", "/b"), 0.5),
      page("c", "/c"),
    );
    const rects = layoutRects(tree, WORKSPACE);
    expect(rects.get("a")).toEqual({ x: 0, y: 0, width: 500, height: 400 });
    expect(rects.get("b")).toEqual({ x: 0, y: 400, width: 500, height: 400 });
    expect(rects.get("c")).toEqual({ x: 500, y: 0, width: 500, height: 800 });
  });

  it("offsets from the workspace origin", () => {
    const rects = layoutRects(twoUp(), { x: 100, y: 40, width: 1000, height: 800 });
    expect(rects.get("right")?.x).toBe(600);
    expect(rects.get("left")?.y).toBe(40);
  });
});

describe("neighborInDirection", () => {
  const rects = layoutRects(twoUp(), WORKSPACE);

  it("moves between side-by-side groups", () => {
    expect(neighborInDirection(rects, "left", "right")).toBe("right");
    expect(neighborInDirection(rects, "right", "left")).toBe("left");
  });

  it("does not jump diagonally", () => {
    expect(neighborInDirection(rects, "left", "up")).toBeNull();
    expect(neighborInDirection(rects, "right", "down")).toBeNull();
  });

  it("prefers the nearest candidate, then the best aligned one", () => {
    const tree = split(
      "s1",
      "horizontal",
      page("src", "/a"),
      split("s2", "vertical", page("near", "/b"), page("far", "/c")),
    );
    const r = layoutRects(tree, WORKSPACE);
    expect(neighborInDirection(r, "src", "right")).toBe("near");
  });

  it("returns null for an unknown source or a dead end", () => {
    expect(neighborInDirection(rects, "nope", "left")).toBeNull();
    expect(neighborInDirection(new Map([["only", WORKSPACE]]), "only", "left")).toBeNull();
  });
});

describe("focusTargetOf", () => {
  it("focused panel of a group / page node", () => {
    expect(focusTargetOf(tabs("t", ["/x", "/y"]), "t")).toBe("/x");
    expect(focusTargetOf(page("p", "/z"), "p")).toBe("/z");
    expect(focusTargetOf(twoUp(), "s1")).toBeNull();
    expect(focusTargetOf(twoUp(), "gone")).toBeNull();
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/nav-geo.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/dock/nav-geo"`.

**Create `src/lib/dock/nav-geo.ts`:**

```ts
/**
 * Spatial geometry for keyboard navigation: where each group sits in the
 * workspace, and which group lies in a given direction. Ratios are used
 * directly (no DOM measuring), so the result is deterministic and testable;
 * the caller supplies the workspace rect.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode } from "./types";
import type { Rect } from "./geometry";
import { findNode } from "./tree";

export type Direction = "left" | "right" | "up" | "down";

/** Slot rect of every focusable node (page/tabs leaves), keyed by node id. */
export function layoutRects(
  tree: DockNode,
  rect: Rect,
  out: Map<string, Rect> = new Map(),
): Map<string, Rect> {
  if (tree.type === "split") {
    const horizontal = tree.direction === "horizontal";
    const firstSize = horizontal ? rect.width * tree.ratio : rect.height * tree.ratio;
    const first: Rect = horizontal
      ? { x: rect.x, y: rect.y, width: firstSize, height: rect.height }
      : { x: rect.x, y: rect.y, width: rect.width, height: firstSize };
    const second: Rect = horizontal
      ? {
          x: rect.x + firstSize,
          y: rect.y,
          width: rect.width - firstSize,
          height: rect.height,
        }
      : {
          x: rect.x,
          y: rect.y + firstSize,
          width: rect.width,
          height: rect.height - firstSize,
        };
    layoutRects(tree.children[0], first, out);
    layoutRects(tree.children[1], second, out);
    return out;
  }
  out.set(tree.id, rect);
  return out;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * The node to focus when moving `fromId` in `dir`.
 * Candidates must lie beyond the source's edge on the movement axis (1px
 * tolerance for shared borders) and overlap the source on the other axis, so
 * "left" never jumps to a diagonally placed group. Nearest gap wins, ties
 * break on how well the two centres line up.
 */
export function neighborInDirection(
  rects: Map<string, Rect>,
  fromId: string,
  dir: Direction,
): string | null {
  const from = rects.get(fromId);
  if (!from) return null;
  const horizontal = dir === "left" || dir === "right";

  const candidates: Array<{ id: string; gap: number; off: number }> = [];
  for (const [id, rect] of rects) {
    if (id === fromId) continue;

    const gap = horizontal
      ? dir === "left"
        ? from.x - (rect.x + rect.width)
        : rect.x - (from.x + from.width)
      : dir === "up"
        ? from.y - (rect.y + rect.height)
        : rect.y - (from.y + from.height);
    if (gap < -1) continue;

    const overlapPx = horizontal
      ? overlap(from.y, from.y + from.height, rect.y, rect.y + rect.height)
      : overlap(from.x, from.x + from.width, rect.x, rect.x + rect.width);
    if (overlapPx <= 0) continue;

    const off = horizontal
      ? Math.abs(rect.y + rect.height / 2 - (from.y + from.height / 2))
      : Math.abs(rect.x + rect.width / 2 - (from.x + from.width / 2));
    candidates.push({ id, gap, off });
  }

  candidates.sort((a, b) =>
    Math.abs(a.gap - b.gap) <= 1 ? a.off - b.off : a.gap - b.gap,
  );
  return candidates.length > 0 ? candidates[0].id : null;
}

/** The panel to focus after moving into `nodeId` (first page of that group). */
export function focusTargetOf(tree: DockNode, nodeId: string): string | null {
  const node = findNode(tree, nodeId);
  if (!node) return null;
  if (node.type === "page") return node.pageId;
  if (node.type === "tabs") return node.activePage;
  return null;
}
```

Run: `pnpm test -- tests/unit/lib/dock/nav-geo.test.ts`
Expected: **PASS** — `Tests 8 passed`.

**Create `tests/unit/lib/dock/keymap.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { dockActionFor, type KeyLike } from "@/lib/dock/keymap";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("dockActionFor", () => {
  it("Alt+Left/Right cycle tabs, Alt+Shift+arrows move focus", () => {
    expect(dockActionFor(key("ArrowLeft"))).toEqual({ kind: "cycle-tab", dir: -1 });
    expect(dockActionFor(key("ArrowRight"))).toEqual({ kind: "cycle-tab", dir: 1 });
    expect(dockActionFor(key("ArrowLeft", { shiftKey: true }))).toEqual({
      kind: "move-focus",
      dir: "left",
    });
    expect(dockActionFor(key("ArrowUp", { shiftKey: true }))).toEqual({
      kind: "move-focus",
      dir: "up",
    });
    expect(dockActionFor(key("ArrowDown", { shiftKey: true }))).toEqual({
      kind: "move-focus",
      dir: "down",
    });
  });

  it("Alt+F/M/C/W are float / maximize / collapse / close", () => {
    expect(dockActionFor(key("f"))).toEqual({ kind: "float-focused" });
    expect(dockActionFor(key("m"))).toEqual({ kind: "toggle-maximize" });
    expect(dockActionFor(key("c"))).toEqual({ kind: "toggle-collapse" });
    expect(dockActionFor(key("w"))).toEqual({ kind: "close-focused" });
  });

  it("ignores chords that belong to the OS or to the app", () => {
    expect(dockActionFor(key("f", { altKey: false }))).toBeNull();
    expect(dockActionFor(key("f", { ctrlKey: true }))).toBeNull();
    expect(dockActionFor(key("f", { metaKey: true }))).toBeNull();
    expect(dockActionFor(key("ArrowUp"))).toBeNull();
    expect(dockActionFor(key("1"))).toBeNull();
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/keymap.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/dock/keymap"`.

**Create `src/lib/dock/keymap.ts`:**

```ts
/**
 * The dock's keyboard grammar, as a pure function so it can be tested and
 * documented in one place. Everything is on Alt because the desktop app has no
 * menu bar (the Electron menu is removed in P1.T5), so Alt+letter is free —
 * and Alt+arrows/data keys do not collide with text editing.
 *
 *   Alt+← / Alt+→              previous / next tab in the focused group
 *   Alt+Shift+← / → / ↑ / ↓    move focus to the group on that side
 *   Alt+F                      float the focused panel
 *   Alt+M                      maximize / restore it
 *   Alt+C                      collapse / restore it (slim bar)
 *   Alt+W                      close it (Ctrl+Shift+K also works)
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { Direction } from "./nav-geo";

export type DockKeyAction =
  | { kind: "cycle-tab"; dir: 1 | -1 }
  | { kind: "close-focused" }
  | { kind: "float-focused" }
  | { kind: "toggle-maximize" }
  | { kind: "toggle-collapse" }
  | { kind: "move-focus"; dir: Direction };

export interface KeyLike {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function dockActionFor(e: KeyLike): DockKeyAction | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  const key = e.key.toLowerCase();

  if (key === "arrowleft") {
    return e.shiftKey ? { kind: "move-focus", dir: "left" } : { kind: "cycle-tab", dir: -1 };
  }
  if (key === "arrowright") {
    return e.shiftKey ? { kind: "move-focus", dir: "right" } : { kind: "cycle-tab", dir: 1 };
  }
  if (key === "arrowup" && e.shiftKey) return { kind: "move-focus", dir: "up" };
  if (key === "arrowdown" && e.shiftKey) return { kind: "move-focus", dir: "down" };
  if (key === "f") return { kind: "float-focused" };
  if (key === "m") return { kind: "toggle-maximize" };
  if (key === "c") return { kind: "toggle-collapse" };
  if (key === "w") return { kind: "close-focused" };
  return null;
}
```

Run: `pnpm test -- tests/unit/lib/dock/keymap.test.ts`
Expected: **PASS** — `Tests 3 passed`.

**Rewire `src/lib/hooks/use-hotkeys.ts`.** `dockFocusNeighbor(dir)` (lines 15-30) and `dockCloseFocused()` (line 32) already exist in this file — reuse them. Add these helpers above `useGlobalHotkeys` and replace the two `altKey` branches (lines 79-90):

```ts
/** The live project's dock state, or null. */
function dockState() {
  const dock = useDockStore.getState();
  return dock.activeProjectId ? (dock.projects[dock.activeProjectId] ?? null) : null;
}

/** Move focus to the group left/right/above/below the focused one. */
function dockMoveFocus(dir: Direction): void {
  const state = dockState();
  if (!state) return;
  const dock = useDockStore.getState();
  const tree = state.workspaces[state.activeWorkspace].tree;
  const holder = findHolder(tree, focusedPanelId(state));
  if (!holder) return;
  const el = document.querySelector<HTMLElement>("[data-dock-workspace]");
  if (!el) return;
  const box = el.getBoundingClientRect();
  const rects = layoutRects(tree, {
    x: box.left,
    y: box.top,
    width: box.width,
    height: box.height,
  });
  const next = neighborInDirection(rects, holder.id, dir);
  if (!next) return;
  const panel = focusTargetOf(tree, next);
  if (panel) dock.focus(panel);
}

/** Run one dock keymap action against the focused panel. */
function runDockAction(action: DockKeyAction): void {
  const state = dockState();
  if (!state) return;
  const focused = focusedPanelId(state);
  const dock = useDockStore.getState();
  switch (action.kind) {
    case "cycle-tab":
      dockFocusNeighbor(action.dir);
      return;
    case "move-focus":
      dockMoveFocus(action.dir);
      return;
    case "close-focused":
      dock.close(focused);
      return;
    case "float-focused":
      dock.float(focused, { x: 160, y: 120 });
      return;
    case "toggle-maximize":
      dock.toggleMaximize(pageIdOf(focused));
      return;
    case "toggle-collapse":
      dock.toggleCollapse(pageIdOf(focused));
      return;
  }
}
```

and inside the listener, **after** the `Ctrl/B`, `Ctrl+/`, `Ctrl+K`, `Ctrl+Shift+K` branches and before the `?` branch:

```ts
      // Dock grammar (Alt-based). Never steal keys from a text field, and only
      // when the dock is the layout in use.
      const action = dockActionFor(e);
      if (action) {
        if (!useUIStore.getState().dockEnabled) return;
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        runDockAction(action);
        return;
      }
```

New imports: `import { dockActionFor, type DockKeyAction } from "@/lib/dock/keymap";`, `import { layoutRects, neighborInDirection, focusTargetOf, type Direction } from "@/lib/dock/nav-geo";`, and add `pageIdOf` to the `@/lib/dock/types` import. Delete the two old `e.altKey && key === "arrowleft"|"arrowright"` branches (the keymap covers them). Update the doc comment at the top of the file to list all bindings.

**Manual verification (2 min, exact):** `pnpm dev` → `/dashboard`. Click the Dashboard panel, then `Alt+Shift+→` → focus moves to the Chat panel (its tab shows the accent background). `Alt+Shift+←` brings it back. `Alt+↑`/`Alt+↓` in this horizontal split do nothing. `Alt+M` maximizes the focused panel (tree stays mounted, panel fills the workspace), `Alt+M` restores. `Alt+F` floats it to (160,120); `Alt+W` closes it and shows the undo toast. `Alt+C` collapses the focused panel into its slim bar; `Alt+C` restores it. Focus a text input in a page and press `Alt+F`: nothing happens (no stolen keys).

Commit: `feat(dock): Alt keymap (focus movement, float, maximize, collapse, close) with a pure keymap module`

---

## P8.T10 — The duplicate-panel question, answered honestly (pure, TDD, ≈6 min)

**Why this task looks like this.** The phase brief asks for an "unsaved/conflict story for duplicate panels of the same entity". Investigating the dock ([A10](#findings)) shows the situation is different from the one the brief assumes: a panel's identity *is* its path — `applyUrlFocus` targets `pageIdOf(panelId)` (dock-core.ts:135), `openPanel` focuses an existing path or inserts it once (tree.ts:206), and the query is only a per-panel snapshot in `params` (dock-core.ts:137-138, 119-124). Two panels of the same **path** are therefore unreachable through the UI: they require hand-editing localStorage or importing a layout file. P8's job is to (1) *prove* that invariant with a test, (2) make the one place where a user could *think* they are opening a second copy — the palette — say **"Focus"** instead of "Open", and (3) state the residual conflict story in the code, so no fake feature gets built.

**Create `tests/unit/lib/dock/panels.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import type { ProjectDockState } from "@/lib/dock/types";
import { defaultProjectState } from "@/lib/dock/presets";
import { applyUrlFocus, floatPanel } from "@/lib/dock/dock-core";
import { panelsForPath, slotOf } from "@/lib/dock/panels";

function stateWith(paths: string[]): ProjectDockState {
  let s = defaultProjectState();
  for (const path of paths) s = applyUrlFocus(s, path);
  return s;
}

describe("panelsForPath", () => {
  it("finds the single panel for a path and where it lives", () => {
    const s = stateWith(["/dashboard", "/tasks"]);
    const found = panelsForPath(s, "/tasks");
    expect(found).toHaveLength(1);
    expect(found[0].panelId).toBe("/tasks");
    expect(found[0].slot.kind).toBe("tree");
  });

  it("uses the path, not the query snapshot", () => {
    const s = applyUrlFocus(defaultProjectState(), "/brain?note=abc");
    expect(panelsForPath(s, "/brain").map((p) => p.panelId)).toEqual(["/brain"]);
  });

  it("sees panels that live in floaters", () => {
    const s = floatPanel(stateWith(["/dashboard", "/chat"]), "/chat", { x: 10, y: 10 });
    const found = panelsForPath(s, "/chat");
    expect(found).toHaveLength(1);
    expect(found[0].slot.kind).toBe("floater");
  });

  it("returns nothing for a path that is not open", () => {
    expect(panelsForPath(defaultProjectState(), "/devlogs")).toEqual([]);
  });
});

describe("one panel per path (the invariant)", () => {
  it("re-opening an already open path never duplicates it", () => {
    let s = stateWith(["/tasks"]);
    for (const url of ["/tasks", "/tasks?task=a", "/tasks?task=b", "/tasks"]) {
      s = applyUrlFocus(s, url);
      expect(panelsForPath(s, "/tasks")).toHaveLength(1);
    }
  });

  it("slotOf resolves tree, floater and collapsed panels", () => {
    const s = stateWith(["/tasks"]);
    expect(slotOf(s, "/tasks")).toEqual({ kind: "tree" });
    expect(slotOf(s, "/nope")).toBeNull();
  });
});
```

Run: `pnpm test -- tests/unit/lib/dock/panels.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/dock/panels"`.

**Create `src/lib/dock/panels.ts`:**

```ts
/**
 * Where a panel lives, and the "one panel per path" invariant.
 *
 * Panel identity is the PATH: "/brain?note=abc" is the page "/brain" plus a
 * query snapshot held in the workspace's `params` map (see types.ts:1-7 and
 * dock-core.ts:130-166). Consequences the UI must respect:
 *
 * 1. Two panels of the same path cannot exist through normal use — the dock
 *    focuses the existing one instead of opening a second copy. A duplicate
 *    can only arrive from a hand-edited localStorage payload or an imported
 *    layout file, which is why this module exists: tests pin the invariant and
 *    callers can ask "is this already open?" before offering to open it.
 * 2. There is therefore no "two editors, one record" conflict inside the dock.
 *    The residual conflict story is narrower and already handled elsewhere:
 *    page components read through Dexie's live queries, so an edit made
 *    anywhere (another panel, a chat tool call, a background job) re-renders
 *    the open panel; the only way to lose work is an *unsaved draft* inside a
 *    keyeep-alive panel being overwritten by a newer record — out of scope for
 *    0.2 (recorded as R-P8-4), mitigated by the activity feed showing the
 *    change (P5) and by editors saving on blur.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode, ProjectDockState } from "./types";
import { pageIdOf } from "./types";
import { collectPages, findNode } from "./tree";

export interface PanelSlot {
  kind: "tree" | "floater" | "collapsed";
  /** Owning node id (kind "tree") or floater id (kind "floater"). */
  ownerId?: string;
}

export interface LocatedPanel {
  panelId: string;
  slot: PanelSlot;
}

/** Node id of the group holding a panel, or null. */
function treeOwner(tree: DockNode, panelId: string): string | null {
  if (tree.type === "page") return tree.pageId === panelId ? tree.id : null;
  if (tree.type === "tabs") return tree.pages.includes(panelId) ? tree.id : null;
  for (const child of tree.children) {
    const hit = treeOwner(child, panelId);
    if (hit) return hit;
  }
  return null;
}

/**
 * Every panel whose path equals `path` (queries ignored), with where it lives.
 * Returns 0 or 1 entry in practice — the invariant test proves it.
 */
export function panelsForPath(state: ProjectDockState, path: string): LocatedPanel[] {
  const entry = state.workspaces[state.activeWorkspace];
  if (!entry) return [];
  const out: LocatedPanel[] = [];

  for (const panelId of collectPages(entry.tree)) {
    if (pageIdOf(panelId) !== path) continue;
    const owner = treeOwner(entry.tree, panelId);
    out.push({ panelId, slot: { kind: "tree", ownerId: owner ?? undefined } });
  }
  for (const floater of state.floaters) {
    for (const panelId of floater.panelIds) {
      if (pageIdOf(panelId) !== path) continue;
      out.push({ panelId, slot: { kind: "floater", ownerId: floater.id } });
    }
  }
  for (const panelId of state.collapsedPanels) {
    if (pageIdOf(panelId) !== path) continue;
    out.push({ panelId, slot: { kind: "collapsed" } });
  }
  return out;
}

/** Where a specific panel id lives, or null when it is not open. */
export function slotOf(state: ProjectDockState, panelId: string): PanelSlot | null {
  return panelsForPath(state, pageIdOf(panelId)).find((p) => p.panelId === panelId)?.slot ?? null;
}

/** True when the page for `panelId` is already open somewhere in the dock. */
export function isPathOpen(state: ProjectDockState, path: string): boolean {
  return panelsForPath(state, path).length > 0;
}

/** Node lookup used by callers that need the owning group node. */
export function owningNode(state: ProjectDockState, panelId: string): DockNode | null {
  const owner = treeOwner(state.workspaces[state.activeWorkspace].tree, panelId);
  return owner ? findNode(state.workspaces[state.activeWorkspace].tree, owner) : null;
}
/* The path half of a panel id is `pageIdOf` from ./types — the invariant
 * module deliberately does not introduce a second name for the same idea. */
```

Run: `pnpm test -- tests/unit/lib/dock/panels.test.ts`
Expected: **PASS** — `Tests 6 passed`.

Commit: `test(dock): pin the one-panel-per-path invariant and document the conflict story`

---

## P8.T11 — Workspace menu: duplicate, delete, undo, and copy/paste a layout (UI, ≈8 min)

**Edit `src/components/dock/workspace-menu.tsx`.** Add the store hooks next to the existing ones:

```tsx
  const deleteWorkspace = useDockStore((s) => s.deleteWorkspace);
  const exportLayout = useDockStore((s) => s.exportLayout);
  const importLayout = useDockStore((s) => s.importLayout);
  const undo = useDockStore((s) => s.undo);
```

Add to the icon import at the top: `Copy, ClipboardPaste, Trash2, Undo2` (all verified present in the installed lucide-react; the file already imports `LayoutPanelTop, Check, Plus, RotateCcw, Save`).

**Duplicate** — inside the workspace list `map` (workspace-menu.tsx:84-99), right after the existing `{name_}` label, add a duplicate button on every row that is not the active one (the current rows have no hover-group class, so the icon stays visible rather than on hover — discoverability beats a hidden affordance):

```tsx
            {name_ !== projectState.activeWorkspace ? (
              <span
                role="button"
                aria-label={`Duplicate workspace ${name_}`}
                title={`Duplicate ${name_}`}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.stopPropagation();
                  useDockStore.getState().saveWorkspaceAs(nextFreeName(projectState, `${name_} copy`));
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  useDockStore.getState().saveWorkspaceAs(nextFreeName(projectState, `${name_} copy`));
                }}
                className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
              </span>
            ) : null}
```

with this module-level helper (so the naming rule is stated once):

```tsx
/** "Planning copy", then "Planning copy 2", … — never an existing name. */
function nextFreeName(state: { workspaces: Record<string, unknown> }, base: string): string {
  if (!state.workspaces[base]) return base;
  let n = 2;
  while (state.workspaces[`${base} ${n}`]) n += 1;
  return `${base} ${n}`;
}
```

**After** the existing `New workspace (copy current)` item and the preset-reset item, append:

```tsx
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copyLayout()}>
          <Copy className="h-4 w-4" /> Copy layout to clipboard
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void pasteLayout()}>
          <ClipboardPaste className="h-4 w-4" /> Paste layout from clipboard
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={workspaces.length <= 1}
          onSelect={() => deleteWorkspace(projectState.activeWorkspace)}
        >
          <Trash2 className="h-4 w-4" /> Delete this workspace
        </DropdownMenuItem>
        {undoDepth > 0 ? (
          <DropdownMenuItem onSelect={undo}>
            <Undo2 className="h-4 w-4" /> Undo last layout change
          </DropdownMenuItem>
        ) : null}
```

and inside the component:

```tsx
  // Undo depth lives in the pure history module; re-deriving it per render is
  // cheap and keeps the menu honest about what can actually be undone.
  const activeProjectId = useDockStore((s) => s.activeProjectId);
  const undoDepth = activeProjectId ? undoDepthOf(activeProjectId) : 0;

  async function copyLayout(): Promise<void> {
    const json = exportLayout();
    if (!json) return;
    await navigator.clipboard.writeText(json);
    pushToast({
      title: "Layout copied",
      description: "Paste it into another project or keep it as a backup.",
      tone: "success",
    });
  }

  async function pasteLayout(): Promise<void> {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      pushToast({
        title: "Clipboard is not available",
        description: "Allow clipboard access, or paste the JSON into a note instead.",
        tone: "danger",
      });
      return;
    }
    const installed = importLayout(text);
    if (!installed) {
      pushToast({
        title: "That is not a MasarFlow layout file",
        description: "Copy one first with “Copy layout to clipboard”.",
        tone: "danger",
      });
    }
  }
```

with `import { undoDepth as undoDepthOf } from "@/lib/dock/undo";` and `import { pushToast } from "@/lib/stores/toast";`.

**Also update `src/components/shell/shortcuts-dialog.tsx`** so the new bindings are discoverable (the user's rule: nothing cryptic). Replace the `Dock (when enabled)` group with:

```tsx
    {
      title: "Dock (when enabled)",
      items: [
        { keys: ["Alt", "←"], label: "Focus previous tab in this group" },
        { keys: ["Alt", "→"], label: "Focus next tab in this group" },
        { keys: ["Alt", "Shift", "←"], label: "Move focus to the group on the left" },
        { keys: ["Alt", "Shift", "→"], label: "Move focus to the group on the right" },
        { keys: ["Alt", "Shift", "↑"], label: "Move focus to the group above" },
        { keys: ["Alt", "Shift", "↓"], label: "Move focus to the group below" },
        { keys: ["Alt", "F"], label: "Float the focused panel" },
        { keys: ["Alt", "M"], label: "Maximize / restore the focused panel" },
        { keys: ["Alt", "C"], label: "Collapse / restore the focused panel" },
        { keys: ["Alt", "W"], label: "Close the focused panel (undo available)" },
        { keys: ["Ctrl", "Shift", "K"], label: "Close the focused panel" },
        { keys: ["Drag"], label: "Move a tab or panel into another split" },
        { keys: ["Double-click"], label: "Reset a split to 50 / 50" },
      ],
    },
    {
      title: "Tool panels (desktop app)",
      items: [
        { keys: ["⌘", "K"], label: "Open: type “terminal”, “logs”, “system info”" },
        { keys: ["Ctrl", "Shift", "C"], label: "Copy the terminal selection" },
      ],
    },
```

**Manual verification (3 min, exact):** `pnpm dev` → `/dashboard`.
1. Workspace menu ▸ *Copy layout to clipboard* → toast *Layout copied*; paste into a text editor → pretty JSON with `"version": 2` and the Development tree.
2. Workspace menu ▸ *Paste layout from clipboard* → toast *Imported layout as “Development 2”*; the topbar now shows *Development 2* and the layout matches.
3. Workspace menu ▸ hover *Planning* → a copy icon appears → click → *Planning copy* becomes active; hover it again → *Duplicate workspace Planning copy*.
4. ◂ switch to *Planning copy* ▸ *Delete this workspace* → toast *Deleted workspace “Planning copy”* with **Undo**; press Undo → the workspace is back and active.
5. Copy a random line from the terminal (`echo hi`) and press *Paste layout from clipboard* → the danger toast *That is not a MasarFlow layout file*; the dock is untouched.
6. Press `?` → the cheatsheet lists all new Alt bindings and the tool-panel section.

Commit: `feat(dock): workspace duplicate/delete/undo + copy-paste layouts, and document the new keys`

---

## P8.T12 — Desktop contract for the terminal (TDD, ≈12 min)

`ptyManager` already exists and P1.T6 keeps it for this phase; P8 adds the four missing pieces: channel names, the preload surface, the main-process handler (which is where the security decision lives), and the pure validators that make the decision testable.

**Create `tests/unit/tools/terminal-contract.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { resolveShell, validateTerminalStart } from "@desktop-shared/terminal";

describe("resolveShell", () => {
  it("uses ComSpec on Windows and never returns an empty command", () => {
    const shell = resolveShell("win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" });
    expect(shell.file).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(shell.args).toEqual([]);
    expect(shell.label).toBe("Command Prompt");
    expect(resolveShell("win32", {}).file).toMatch(/powershell|cmd/i);
  });

  it("uses $SHELL on POSIX and falls back to a real binary", () => {
    expect(resolveShell("darwin", { SHELL: "/bin/zsh" })).toEqual({
      file: "/bin/zsh",
      args: ["-l"],
      label: "zsh",
    });
    expect(resolveShell("linux", {}).file).toBe("/bin/bash");
  });
});

describe("validateTerminalStart", () => {
  const ROOTS = ["C:\\Projects\\Game", "/home/me/projects/app"];

  it("accepts a cwd inside a registered root and clamps the viewport", () => {
    const res = validateTerminalStart(
      { cwd: "C:\\Projects\\Game\\src", cols: 9000, rows: 0 },
      ROOTS,
      "win32",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.cwd).toBe("C:\\Projects\\Game\\src");
      expect(res.cols).toBe(400);
      expect(res.rows).toBe(5);
    }
  });

  it("rejects anything the renderer could send by mistake or on purpose", () => {
    const cases: unknown[] = [
      null,
      "C:\\Projects\\Game",
      42,
      {},
      { cwd: "" },
      { cwd: "relative/path" },
      { cwd: "C:\\Windows\\System32" },
      { cwd: "\\\\server\\share" },
      { cwd: "C:\\Projects\\Game\\..\\..\\Windows" },
    ];
    for (const value of cases) {
      expect(validateTerminalStart(value, ROOTS, "win32").ok, JSON.stringify(value)).toBe(false);
    }
  });

  it("refuses when no root is registered at all", () => {
    expect(validateTerminalStart({ cwd: "C:\\Projects\\Game" }, [], "win32").ok).toBe(false);
  });

  it("explains the refusal in the user's words", () => {
    const res = validateTerminalStart({ cwd: "C:\\Windows" }, ROOTS, "win32");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("registered folder");
  });
});
```

Run: `pnpm test -- tests/unit/tools/terminal-contract.test.ts`
Expected: **FAIL** — `Failed to resolve import "@desktop-shared/terminal"` (the alias itself is added by P1.T1; if the runner cannot resolve `@desktop-shared` at all, check `tests/vitest.config.ts` has the alias before touching this test).

**Create `desktop/src/shared/terminal.ts`:**

```ts
/**
 * The terminal contract between the renderer and the main process: which shell
 * to spawn, and — the security boundary — whether a requested working
 * directory may be spawned in at all.
 *
 * The renderer is NEVER trusted with a path decision (master D3): it may only
 * propose a `cwd`; the main process validates it against the registered roots
 * (roots.json, written only by a folder the user picked in the native dialog).
 *
 * Pure TypeScript only — no Electron, node:fs, or DOM imports, so node-env
 * tests cover every branch.
 */

import { isAbsolute, resolve } from "node:path";
import { isRootAllowed } from "./roots";

export interface ShellSpec {
  file: string;
  args: string[];
  /** Human label used in the session list: "PowerShell", "zsh". */
  label: string;
}

/** Bounds for a renderer-supplied viewport (rows fall back to the pty default). */
export const MIN_COLS = 20;
export const MAX_COLS = 400;
export const MIN_ROWS = 5;
export const MAX_ROWS = 200;

/**
 * The shell to start for a platform. Windows prefers ComSpec (cmd.exe), then
 * PowerShell; POSIX uses $SHELL, then /bin/bash. A login shell on POSIX keeps
 * the user's PATH exactly as their terminal has it.
 */
export function resolveShell(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): ShellSpec {
  if (platform === "win32") {
    const comspec = env.ComSpec ?? env.COMSPEC;
    if (comspec && comspec.length > 0) {
      return { file: comspec, args: [], label: "Command Prompt" };
    }
    return {
      file: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      args: ["-NoLogo"],
      label: "PowerShell",
    };
  }
  const shell = env.SHELL && env.SHELL.length > 0 ? env.SHELL : "/bin/bash";
  const label = shell.split("/").pop() ?? "shell";
  return { file: shell, args: ["-l"], label };
}

export type StartVerdict =
  | { ok: true; cwd: string; cols: number; rows: number }
  | { ok: false; error: string };

/**
 * Validate a renderer-supplied start request.
 * Order matters: shape, then absolute path, then the root allow-list — the
 * allow-list check resolves ".." and symlink-free canonical forms first, so
 * "C:\\Projects\\Game\\..\\..\\Windows" is refused.
 */
export function validateTerminalStart(
  request: unknown,
  roots: string[],
  platform: NodeJS.Platform = process.platform,
): StartVerdict {
  if (typeof request !== "object" || request === null) {
    return { ok: false, error: "The terminal request was malformed." };
  }
  const { cwd, cols, rows } = request as { cwd?: unknown; cols?: unknown; rows?: unknown };
  if (typeof cwd !== "string" || cwd.length === 0) {
    return { ok: false, error: "No folder was given for the terminal session." };
  }
  if (!isAbsolute(cwd)) {
    return { ok: false, error: "The terminal needs an absolute folder path." };
  }
  if (roots.length === 0) {
    return {
      ok: false,
      error:
        "No folder is registered for this machine. Link the project folder in Chat → Linked folders first.",
    };
  }
  if (!isRootAllowed(cwd, roots, platform)) {
    return {
      ok: false,
      error: `“${cwd}” is not inside a registered folder. Link it in Chat → Linked folders, then try again.`,
    };
  }
  return {
    ok: true,
    cwd: resolve(cwd),
    cols: clampNumber(cols, MIN_COLS, MAX_COLS, 120),
    rows: clampNumber(rows, MIN_ROWS, MAX_ROWS, 30),
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
```

Run: `pnpm test -- tests/unit/tools/terminal-contract.test.ts`
Expected: **PASS** — `Tests 6 passed`.

**Wire the channels, API, preload and main handler.**

1. `desktop/src/shared/channels.ts` — append inside `CH` (P2 already added `rootsList`/`rootsCovers` there):
```ts
  // P8: tool panels
  terminalStart: "terminal:start",
  terminalList: "terminal:list",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalKill: "terminal:kill",
  terminalBuffer: "terminal:buffer",
  terminalClear: "terminal:clear",
  terminalOutput: "terminal:output",
  terminalExit: "terminal:exit",
  logsList: "logs:list",
  logsTail: "logs:tail",
```

2. `desktop/src/shared/api.ts` — add to `MasarflowApi`:
```ts
  terminal: {
    /** Start a shell inside a registered root. Refused by the main process otherwise. */
    start(input: {
      cwd: string;
      cols?: number;
      rows?: number;
    }): Promise<{ ok: true; session: SessionInfo } | { ok: false; error: string }>;
    list(): Promise<SessionInfo[]>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): Promise<boolean>;
    /** Everything the session printed, for re-attach after a reload. */
    buffer(id: string): Promise<string>;
    clear(id: string): Promise<void>;
    onOutput(cb: (payload: { id: string; data: string }) => void): () => void;
    onExit(cb: (payload: { id: string; exitCode: number | null }) => void): () => void;
  };
  logs: {
    list(): Promise<{ name: string; bytes: number; modifiedAt: number }[]>;
    tail(name: string, lines?: number): Promise<string[]>;
  };
```
(with `import type { SessionInfo } from "./types";` at the top of api.ts)

3. `desktop/src/preload/index.ts` — add the two groups (follow the existing `invoke`/`send` + unsubscribe pattern used by `window.onMaximized`):
```ts
  terminal: {
    start: (input) => ipcRenderer.invoke(CH.terminalStart, input),
    list: () => ipcRenderer.invoke(CH.terminalList),
    write: (id, data) => {
      ipcRenderer.send(CH.terminalWrite, id, data);
    },
    resize: (id, cols, rows) => {
      ipcRenderer.send(CH.terminalResize, id, cols, rows);
    },
    kill: (id) => ipcRenderer.invoke(CH.terminalKill, id),
    buffer: (id) => ipcRenderer.invoke(CH.terminalBuffer, id),
    clear: (id) => ipcRenderer.invoke(CH.terminalClear, id),
    onOutput: (cb) => {
      const listener = (_e: unknown, payload: { id: string; data: string }): void => cb(payload);
      ipcRenderer.on(CH.terminalOutput, listener);
      return () => ipcRenderer.removeListener(CH.terminalOutput, listener);
    },
    onExit: (cb) => {
      const listener = (_e: unknown, payload: { id: string; exitCode: number | null }): void => cb(payload);
      ipcRenderer.on(CH.terminalExit, listener);
      return () => ipcRenderer.removeListener(CH.terminalExit, listener);
    },
  },
  logs: {
    list: () => ipcRenderer.invoke(CH.logsList),
    tail: (name, lines) => ipcRenderer.invoke(CH.logsTail, name, lines),
  },
```

4. **Create `desktop/src/main/ipc/terminal.ts`:**

```ts
/**
 * Terminal IPC. THE security boundary of the tool panels: the renderer may
 * name a folder, this module decides whether a shell may run in it, and it
 * re-decides on every start (roots.json is re-read each time, so a root the
 * user removed stops working immediately).
 */

import { app, ipcMain, type BrowserWindow } from "electron";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { resolveShell, validateTerminalStart } from "@shared/terminal";
import { readRootsFile } from "../security/roots";
import { ptyManager } from "../pty";

export function registerTerminalIpc(getWindow: () => BrowserWindow | null): void {
  const rootsFilePath = (): string => join(app.getPath("userData"), "roots.json");
  const send = (channel: string, payload: unknown): void => {
    getWindow()?.webContents.send(channel, payload);
  };

  ipcMain.handle(CH.terminalStart, (_event, request: unknown) => {
    const verdict = validateTerminalStart(request, readRootsFile(rootsFilePath()));
    if (!verdict.ok) return { ok: false, error: verdict.error };

    const shell = resolveShell(process.platform, process.env);
    const session = ptyManager.start(
      {
        label: shell.label,
        kind: "shell",
        command: [shell.file, ...shell.args].join(" "),
        file: shell.file,
        args: shell.args,
        cwd: verdict.cwd,
      },
      verdict.cols,
      verdict.rows,
    );
    return { ok: true, session };
  });

  ipcMain.handle(CH.terminalList, () =>
    ptyManager.list().filter((session) => session.kind === "shell"),
  );

  ipcMain.on(CH.terminalWrite, (_event, id: unknown, data: unknown) => {
    if (typeof id !== "string" || typeof data !== "string") return;
    if (data.length > 100_000) return; // a single keystroke batch is never this big
    ptyManager.write(id, data);
  });

  ipcMain.on(CH.terminalResize, (_event, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id !== "string") return;
    ptyManager.resize(id, Number(cols), Number(rows));
  });

  ipcMain.handle(CH.terminalKill, (_event, id: unknown) => {
    if (typeof id !== "string") return false;
    ptyManager.kill(id);
    return true;
  });

  ipcMain.handle(CH.terminalBuffer, (_event, id: unknown) =>
    typeof id === "string" ? ptyManager.buffer(id) : "",
  );

  ipcMain.handle(CH.terminalClear, (_event, id: unknown) => {
    if (typeof id === "string") ptyManager.clearBuffer(id);
  });

  ptyManager.on("output", (payload) => send(CH.terminalOutput, payload));
  ptyManager.on("exit", (payload) => send(CH.terminalExit, payload));
}
```

5. Call it from `desktop/src/main/ipc/index.ts` inside `registerIpc` (the function P1.T5 created), next to the other registrars:
```ts
  registerTerminalIpc(getWindow);
  registerLogsIpc(getWindow); // P8.T14
```

6. `desktop/src/main/window.ts` (P1.T5) must kill the shells on unload — ptyManager already has `killAll()`; add to the existing `close`/`before-quit` handling:
```ts
  mainWindow.on("closed", () => {
    ptyManager.killAll();
  });
```
(import `ptyManager` from `./pty`; if P1 already installed a `killAll` hook for the chat sessions, only add the terminal note to its comment.)

Verify: `pnpm desktop:typecheck && pnpm typecheck` → exit 0; `pnpm test -- tests/unit/tools/terminal-contract.test.ts` → PASS.

Commit: `feat(desktop): terminal IPC — main-process root validation, pty sessions, preload surface`

---

## P8.T13 — The terminal, as a dock panel (UI + client helpers, TDD for the pure parts, ≈15 min)

**Add the terminal engine to the root app:**
```bash
pnpm add xterm@^5.3.0 @xterm/addon-fit@^0.11.0
```
These are the exact versions the retired launcher renderer used (`desktop/src/renderer/src/components/terminal/terminal-view.tsx:1-2`), so the ported code type-checks unchanged. The Next app must also load xterm's stylesheet — add to the top of `src/app/globals.css`:
```css
@import "xterm/css/xterm.css";
```

**Create `tests/unit/tools/terminal-client.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { exitNote, sessionLabel, terminalWarning } from "@/lib/tools/terminal";

describe("sessionLabel", () => {
  it("names the shell and the folder", () => {
    expect(sessionLabel("Command Prompt", "C:\\Projects\\Game")).toBe(
      "Command Prompt — Game",
    );
    expect(sessionLabel("zsh", "/home/me/app")).toBe("zsh — app");
  });

  it("never shows an empty folder name", () => {
    expect(sessionLabel("zsh", "/")).toBe("zsh — /");
    expect(sessionLabel("zsh", "")).toBe("zsh — unknown folder");
  });
});

describe("exitNote", () => {
  it("says what happened in plain words", () => {
    expect(exitNote(0)).toBe("Process exited with code 0.");
    expect(exitNote(130)).toBe("Process exited with code 130.");
    expect(exitNote(null)).toBe("Process exited.");
  });
});

describe("terminalWarning", () => {
  it("names the folder and states the consequence before anything runs", () => {
    const warning = terminalWarning("C:\\Projects\\Game");
    expect(warning).toContain("C:\\Projects\\Game");
    expect(warning).toContain("real");
    expect(warning).toContain("cannot be undone");
  });
});
```

Run: `pnpm test -- tests/unit/tools/terminal-client.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/tools/terminal"`.

**Create `src/lib/tools/terminal.ts`:**

```ts
/**
 * Client-side pure helpers for the terminal panel. Everything that decides
 * *what* runs lives in the main process (desktop/src/shared/terminal.ts);
 * this module only formats what the user sees.
 *
 * Pure TypeScript only — no React, Next, DOM, or Electron imports.
 */

export interface TerminalSessionView {
  id: string;
  label: string;
  cwd: string;
  status: "running" | "exited";
  exitCode: number | null;
}

/** Last path segment of `dir`, tolerating both separators. */
export function folderName(dir: string): string {
  const trimmed = dir.replace(/[/\\]+$/, "");
  if (trimmed.length === 0) return "/";
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

export function sessionLabel(shellLabel: string, cwd: string): string {
  if (!cwd) return `${shellLabel} — unknown folder`;
  return `${shellLabel} — ${folderName(cwd)}`;
}

/** One line for the terminal's scrollback when the shell ends. */
export function exitNote(exitCode: number | null): string {
  return exitCode === null
    ? "Process exited."
    : `Process exited with code ${exitCode}.`;
}

/**
 * The warning shown ABOVE the terminal, before the first keystroke. Plain
 * language, no jargon: this is the user's rule for destructive affordances.
 */
export function terminalWarning(cwd: string): string {
  return `Commands run on this computer, inside ${cwd}. What you type here runs for real and cannot be undone from MasarFlow.`;
}

/** Is the given folder one the desktop app has on its allow-list? */
export function rootStateText(allowed: boolean, desktop: boolean): string {
  if (!desktop) return "Only the desktop app can run commands.";
  return allowed
    ? "This folder is allowed for the agent and the terminal."
    : "This folder is not registered. Link it in Chat → Linked folders to allow commands.";
}
```

Run: `pnpm test -- tests/unit/tools/terminal-client.test.ts`
Expected: **PASS** — `Tests 6 passed`.

**Create `src/app/(workspace)/tools/terminal/page.tsx`:**

```tsx
"use client";

import { TerminalPanel } from "@/components/tools/terminal-panel";

export default function TerminalPage() {
  return <TerminalPanel />;
}
```

**Create `src/components/tools/terminal-panel.tsx`** (the port of the launcher renderer, adapted to the workspace app). Key behaviours to carry over verbatim from `desktop/src/renderer/src/components/terminal/terminal-view.tsx:16-119`: `FitAddon` + `ResizeObserver` → `resize(id, term.cols, term.rows)`; `buffer(id)` replay on mount; `onData` → `write(id, data)` with the `\x16` paste branch; `Ctrl+C`-with-selection copies instead of sending SIGINT; `allowTransparency`, `scrollback: 10_000`, `convertEol: false`; theme from the app's CSS variables rather than the launcher's `xtermTheme(accent)`.

```tsx
"use client";

/**
 * Terminal panel: a real shell in a dock panel.
 *
 * The panel is a normal dock page — it can be tabbed, split, floated and is
 * restored after a reload (sessions are re-attached from the main process's
 * ring buffer). The main process decides whether the folder may be used; this
 * component states that decision in words before anything runs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal as Xterm, type ITerminalOptions } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Ban, CircleCheck, Play, RefreshCw, SquareTerminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDesktop } from "@/lib/desktop/bridge";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { linkedProjectsRepo } from "@/lib/db/repos";
import type { LinkedProject } from "@/lib/db/schema";
import {
  exitNote,
  rootStateText,
  sessionLabel,
  terminalWarning,
  type TerminalSessionView,
} from "@/lib/tools/terminal";
import { cn } from "@/lib/utils/cn";

export function TerminalPanel() {
  const desktop = useMemo(() => getDesktop(), []);
  const projectId = useActiveProjectId();
  const [roots, setRoots] = useState<LinkedProject[]>([]);
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<TerminalSessionView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!desktop || !projectId) return;
    const list = await linkedProjectsRepo.listByProject(projectId);
    setRoots(list);
    const entries = await Promise.all(
      list.map(async (root) => [root.rootPath, await desktop.roots.covers(root.rootPath)] as const),
    );
    setAllowed(Object.fromEntries(entries));
    const live = await desktop.terminal.list();
    setSessions(live.map((s) => ({ id: s.id, label: s.label, cwd: s.cwd, status: s.status, exitCode: s.exitCode })));
    setActiveId((current) => current ?? live[0]?.id ?? null);
  }, [desktop, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Session list follows the main process.
  useEffect(() => {
    if (!desktop) return;
    const offExit = desktop.terminal.onExit(({ id, exitCode }) => {
      setSessions((list) =>
        list.map((s) => (s.id === id ? { ...s, status: "exited", exitCode } : s)),
      );
      setActiveId((current) => current ?? id);
    });
    return () => offExit();
  }, [desktop]);

  async function start(root: LinkedProject): Promise<void> {
    if (!desktop) return;
    setBusy(true);
    setError(null);
    try {
      const res = await desktop.terminal.start({ cwd: root.rootPath });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const session = res.session;
      setSessions((list) => [
        ...list,
        { id: session.id, label: session.label, cwd: session.cwd, status: session.status, exitCode: session.exitCode },
      ]);
      setActiveId(session.id);
    } finally {
      setBusy(false);
    }
  }

  async function closeSession(id: string): Promise<void> {
    await desktop?.terminal.kill(id);
    setSessions((list) => list.filter((s) => s.id !== id));
    setActiveId((current) => (current === id ? null : current));
  }

  if (!desktop) {
    return (
      <EmptyState
        icon={SquareTerminal}
        title="The terminal runs in the desktop app"
        description="Open MasarFlow as the desktop app to run commands. The browser build cannot start a shell on this machine."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Session bar */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setActiveId(session.id)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
                session.id === activeId
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {sessionLabel(session.label, session.cwd)}
              {session.status === "exited" ? (
                <span className="text-[10px] text-muted-foreground">(exited)</span>
              ) : null}
            </button>
          ))}
          {sessions.length === 0 ? (
            <span className="text-xs text-muted-foreground">No session yet.</span>
          ) : null}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Refresh sessions" onClick={() => void refresh()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Run-in picker: shows the allow-list decision before anything runs. */}
      <div className="shrink-0 space-y-1 border-b border-border px-3 py-2">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Start a session in
        </p>
        {roots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No folder is linked to this project yet. Link one in{" "}
            <span className="font-medium">Chat → Linked folders</span>, then refresh.
          </p>
        ) : (
          <ul className="space-y-1">
            {roots.map((root) => (
              <li key={root.id} className="flex items-center gap-2 text-xs">
                {allowed[root.rootPath] ? (
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono">{root.rootPath}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !allowed[root.rootPath]}
                  onClick={() => void start(root)}
                >
                  <Play className="h-3 w-3" /> Start
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">
          {rootStateText(rootStateVisible(allowed), true)}
        </p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {/* Terminal surface */}
      <div className="min-h-0 flex-1">
        {activeId ? (
          <TerminalView
            key={activeId}
            sessionId={activeId}
            cwd={sessions.find((s) => s.id === activeId)?.cwd ?? ""}
            onClose={() => void closeSession(activeId)}
          />
        ) : (
          <EmptyState
            icon={SquareTerminal}
            title="Nothing running"
            description="Pick a folder above and press Start. Commands run on this computer, inside that folder."
          />
        )}
      </div>
    </div>
  );
}

/** True when at least one linked root is currently registered. */
function rootStateVisible(allowed: Record<string, boolean>): boolean {
  return Object.values(allowed).some(Boolean);
}

function TerminalView({
  sessionId,
  cwd,
  onClose,
}: {
  sessionId: string;
  cwd: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const desktop = getDesktop();
    const container = containerRef.current;
    if (!desktop || !container) return;

    const options: ITerminalOptions = {
      fontFamily: "Geist Mono, ui-monospace, monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10_000,
      allowTransparency: true,
      convertEol: false,
      theme: {
        background: "transparent",
        foreground: "#e4e4e7",
        cursor: "#a1a1aa",
        selectionBackground: "#3f3f46",
      },
    };
    const term = new Xterm(options);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    let mounted = true;
    const write = (data: string): void => {
      if (mounted) term.write(data);
    };

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "c" || e.key === "C") && term.hasSelection()) {
        const text = term.getSelection();
        term.clearSelection();
        void desktop.clipboard.writeText(text);
        return false;
      }
      return true;
    });

    void desktop.terminal.buffer(sessionId).then((buffer) => {
      if (mounted && buffer) term.write(buffer);
    });

    const offOut = desktop.terminal.onOutput(({ id, data }) => {
      if (id === sessionId) write(data);
    });
    const offExit = desktop.terminal.onExit(({ id, exitCode }) => {
      if (id === sessionId) {
        write(`\r\n\x1b[38;5;242m───────────── ${exitNote(exitCode)} ─────────────\x1b[0m\r\n`);
      }
    });
    const onData = term.onData((data) => {
      if (data === "\x16") {
        void desktop.clipboard.readText().then((text) => {
          if (text && mounted) term.paste(text);
        });
        return;
      }
      desktop.terminal.write(sessionId, data);
    });

    const doFit = (): void => {
      try {
        fit.fit();
        desktop.terminal.resize(sessionId, term.cols, term.rows);
      } catch {
        // container hidden (inactive tab) — the observer retries on next tick
      }
    };
    const observer = new ResizeObserver(() => doFit());
    observer.observe(container);
    requestAnimationFrame(doFit);

    const focus = (): void => term.focus();
    container.addEventListener("click", focus);

    return () => {
      mounted = false;
      offOut();
      offExit();
      onData.dispose();
      observer.disconnect();
      container.removeEventListener("click", focus);
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {terminalWarning(cwd)}
        </p>
        <Button variant="ghost" size="icon-sm" aria-label="End this session" onClick={onClose}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={containerRef}
        aria-label="Terminal output"
        className="h-full w-full overflow-hidden bg-background p-2"
      />
    </div>
  );
}
```

**Mount the session tracker app-wide** so a reload restores the terminal tabs honestly — create `src/lib/hooks/use-terminal-sync.ts`:

```ts
"use client";

/**
 * Keeps the dock's terminal panel in step with the main process across a page
 * reload: sessions survive in the main process (ring buffer + pty), so the
 * panel re-attaches to them instead of pretending they are gone.
 *
 * Nothing here starts a process — only the user does, from the panel.
 */

import { useEffect } from "react";
import { getDesktop } from "@/lib/desktop/bridge";

export function useTerminalSync(): void {
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;
    // Touch the list once so the main process's session table is warm and any
    // crashed shell is reported as exited rather than silently missing.
    void desktop.terminal.list();
  }, []);
}
```

Call `useTerminalSync()` once in `src/components/dock/dock-workspace.tsx` (next to `useDockDnd()`).

**Manual verification (4 min, in the desktop app — the browser shows the empty state by design):**
1. `pnpm desktop:dev` (P1.T8 gives the script) — the app opens on `masarflow://app/dashboard`.
2. Palette (`⌘/Ctrl+K`) → type `terminal` → *Terminal* → Enter. The panel docks (it is a normal panel).
3. Before starting: the *Start a session in* list shows the project's linked folder with a green check when it is registered, and Start is disabled with the grey ban icon plus the sentence *"This folder is not registered. Link it in Chat → Linked folders…"* when it is not.
4. Press Start → a prompt appears. The amber line above the terminal reads *"Commands run on this computer, inside C:\… . What you type here runs for real and cannot be undone from MasarFlow."*
5. Type `echo hello` → output appears. Type `cd ..` twice, then `cd C:\Windows` → the shell changes directory (the shell is *not* sandboxed once running — the warning says so on screen; see R-P8-2).
6. Reload the window (`Ctrl+R`) → the Terminal panel comes back with the session listed and its scrollback replayed from the ring buffer.
7. Delete the folder from `Chat → Linked folders`, then try Start again → the panel shows the main process's refusal text and no session starts (the allow-list is re-read per start).
8. Split the panel (drag its tab to the right half) → the terminal re-fits (`resize` is called on every ResizeObserver tick).

Commit: `feat(dock): terminal panel backed by the main-process pty (dock page, re-attach, root guard)`

---

## P8.T14 — Log panel: read what the app actually wrote (pure, TDD, ≈12 min)

**Create `tests/unit/tools/logs.test.ts` (failing):**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listLogs, readLogTail, safeLogName, tailLines } from "@desktop/logs";
import { lineLevel, levelFilterLabel } from "@/lib/tools/logs";

describe("tailLines", () => {
  it("returns the last N lines and drops the trailing newline", () => {
    expect(tailLines("a\nb\nc\n", 2)).toEqual(["b", "c"]);
    expect(tailLines("only", 5)).toEqual(["only"]);
    expect(tailLines("", 5)).toEqual([]);
  });

  it("caps the number of lines it will ever return", () => {
    const big = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\n");
    expect(tailLines(big, 10_000)).toHaveLength(1000);
  });
});

describe("safeLogName", () => {
  it("accepts plain file names and rejects traversal", () => {
    expect(safeLogName("main.log")).toBe("main.log");
    expect(safeLogName("app-2026-10-16.log")).toBe("app-2026-10-16.log");
    expect(safeLogName("../secrets.json")).toBeNull();
    expect(safeLogName("sub/dir.log")).toBeNull();
    expect(safeLogName("sub\\dir.log")).toBeNull();
    expect(safeLogName("")).toBeNull();
    expect(safeLogName(".env")).toBeNull();
  });
});

describe("listLogs / readLogTail", () => {
  it("lists log files newest first and tails one of them", () => {
    const dir = mkdtempSync(join(tmpdir(), "masarflow-logs-"));
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "main.log"), "one\ntwo\nthree\n");
    writeFileSync(join(dir, "other.txt"), "not a log\n");
    writeFileSync(join(dir, "nested", "deep.log"), "ignored\n");

    const files = listLogs(dir);
    expect(files.map((f) => f.name)).toEqual(["main.log"]);
    expect(files[0].bytes).toBeGreaterThan(0);

    expect(readLogTail(dir, "main.log", 2)).toEqual(["two", "three"]);
    expect(readLogTail(dir, "missing.log")).toEqual([]);
    expect(readLogTail(dir, "../secrets.json")).toEqual([]);
    expect(listLogs(join(dir, "does-not-exist"))).toEqual([]);
  });
});

describe("lineLevel", () => {
  it("classifies by the strongest signal in the line", () => {
    expect(lineLevel("2026-10-16 ERROR cannot bind port")).toBe("error");
    expect(lineLevel("warn: slow query")).toBe("warn");
    expect(lineLevel("Server listening on 4010")).toBe("info");
    expect(lineLevel("")).toBe("info");
  });

  it("labels the filter for the UI", () => {
    expect(levelFilterLabel("error")).toBe("Errors only");
    expect(levelFilterLabel("all")).toBe("Everything");
  });
});
```

Run: `pnpm test -- tests/unit/tools/logs.test.ts`
Expected: **FAIL** — `Failed to resolve import "@desktop/logs"`.

**Create `desktop/src/main/logs.ts`:**

```ts
/**
 * Log reading for the Logs panel. Read-only, bounded, and never leaves the
 * app's own log directory: names are validated as single path segments and
 * the directory is never taken from the renderer.
 *
 * Pure node — no Electron import — so node-env tests can use a temp dir.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface LogFile {
  name: string;
  bytes: number;
  modifiedAt: number;
}

/** Hard caps: the panel shows a tail, not a whole log. */
export const MAX_LINES = 1000;
export const MAX_BYTES = 512 * 1024;

/** A single path segment ending in .log — no traversal, no dotfiles. */
export function safeLogName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  if (name.length === 0 || name.length > 128) return null;
  if (name.startsWith(".")) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (!name.endsWith(".log")) return null;
  return name;
}

/** The last `max` lines of a text blob (max clamped to MAX_LINES). */
export function tailLines(text: string, max = 200): string[] {
  const limit = Math.max(1, Math.min(MAX_LINES, Math.floor(max)));
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-limit);
}

/** Every *.log directly inside `dir`, newest first. Empty when unreadable. */
export function listLogs(dir: string): LogFile[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const files: LogFile[] = [];
  for (const name of names) {
    const safe = safeLogName(name);
    if (!safe) continue;
    try {
      const stat = statSync(join(dir, safe));
      if (!stat.isFile()) continue;
      files.push({ name: safe, bytes: stat.size, modifiedAt: stat.mtimeMs });
    } catch {
      // unreadable entry — skip it rather than failing the whole list
    }
  }
  return files.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** The tail of one log file. [] when the name or the file is not usable. */
export function readLogTail(dir: string, name: unknown, max = 200): string[] {
  const safe = safeLogName(name);
  if (!safe) return [];
  try {
    const path = join(dir, safe);
    const stat = statSync(path);
    const slice = Math.min(stat.size, MAX_BYTES);
    const buffer = readFileSync(path);
    const text = buffer.subarray(Math.max(0, buffer.length - slice)).toString("utf8");
    return tailLines(text, max);
  } catch {
    return [];
  }
}
```

**Create `desktop/src/main/ipc/logs.ts`:**

```ts
/**
 * Logs IPC: the Logs panel lists and tails the app's own log directory. The
 * directory comes from Electron, never from the renderer, and file names are
 * validated (safeLogName) — this channel cannot read arbitrary files.
 */

import { app, ipcMain, type BrowserWindow } from "electron";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { listLogs, readLogTail } from "../logs";

export function registerLogsIpc(_getWindow: () => BrowserWindow | null): void {
  const logsDir = (): string => join(app.getPath("userData"), "logs");

  ipcMain.handle(CH.logsList, () => listLogs(logsDir()));

  ipcMain.handle(CH.logsTail, (_event, name: unknown, lines: unknown) =>
    readLogTail(logsDir(), name, typeof lines === "number" ? lines : 200),
  );
}
```

**Create `src/lib/tools/logs.ts`:**

```ts
/**
 * Log-viewer helpers: classify a line so the panel can colour and filter it.
 * Pure so the classification is testable; the main process owns the file I/O.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

export type LogLevel = "error" | "warn" | "info";
export type LogFilter = LogLevel | "all";

/** The strongest signal in the line wins ("error" beats "warn"). */
export function lineLevel(line: string): LogLevel {
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("unhandled") || lower.includes("failed")) {
    return "error";
  }
  if (lower.includes("warn") || lower.includes("deprecat")) return "warn";
  return "info";
}

export function levelClass(level: LogLevel): string {
  switch (level) {
    case "error":
      return "text-destructive";
    case "warn":
      return "text-amber-500";
    default:
      return "text-muted-foreground";
  }
}

export function levelFilterLabel(filter: LogFilter): string {
  switch (filter) {
    case "error":
      return "Errors only";
    case "warn":
      return "Warnings and errors";
    default:
      return "Everything";
  }
}

/** True when a line passes the active filter. */
export function passesFilter(line: string, filter: LogFilter): boolean {
  const level = lineLevel(line);
  if (filter === "all") return true;
  if (filter === "error") return level === "error";
  return level === "error" || level === "warn";
}
```

Add to `tests/unit/tools/logs.test.ts` the two extra assertions now that `passesFilter` exists:

```ts
describe("passesFilter", () => {
  it("shows errors and warnings when asked", () => {
    expect(passesFilter("ERROR boom", "error")).toBe(true);
    expect(passesFilter("warn: slow", "error")).toBe(false);
    expect(passesFilter("warn: slow", "warn")).toBe(true);
    expect(passesFilter("all good", "warn")).toBe(false);
    expect(passesFilter("all good", "all")).toBe(true);
  });
});
```

(import `passesFilter` alongside `lineLevel`.)

Run: `pnpm test -- tests/unit/tools/logs.test.ts`
Expected: **PASS** (the `@desktop/logs` suite uses a temp dir created inside the test). Then `pnpm desktop:typecheck` → exit 0.

**Create `src/app/(workspace)/tools/logs/page.tsx`:**

```tsx
"use client";

import { LogsPanel } from "@/components/tools/logs-panel";

export default function LogsPage() {
  return <LogsPanel />;
}
```

**Create `src/components/tools/logs-panel.tsx`:**

```tsx
"use client";

/**
 * Log panel: pick one of the app's log files and read its tail. Read-only —
 * there is no "clear logs" button on purpose (deleting evidence while
 * debugging is how bugs get lost); use "Open logs folder" to manage them.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ban as _unused } from "lucide-react"; // placeholder removed below
```

Write the real component:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDesktop } from "@/lib/desktop/bridge";
import { levelClass, levelFilterLabel, lineLevel, passesFilter, type LogFilter } from "@/lib/tools/logs";
import { cn } from "@/lib/utils/cn";

interface LogFileView {
  name: string;
  bytes: number;
  modifiedAt: number;
}

const FILTERS: LogFilter[] = ["all", "warn", "error"];

export function LogsPanel() {
  const desktop = useMemo(() => getDesktop(), []);
  const [files, setFiles] = useState<LogFileView[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (name?: string) => {
      if (!desktop) return;
      setBusy(true);
      try {
        const list = await desktop.logs.list();
        setFiles(list);
        const target = name ?? active ?? list[0]?.name ?? null;
        setActive(target);
        setLines(target ? await desktop.logs.tail(target, 400) : []);
      } finally {
        setBusy(false);
      }
    },
    [active, desktop],
  );

  useEffect(() => {
    void load();
    // Refresh every 5 s so a running server's output is visible while it happens.
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop]);

  if (!desktop) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Logs are read by the desktop app"
        description="The browser build has no access to the application's log folder. Open the desktop app to read them."
      />
    );
  }

  const visible = lines.filter((line) => passesFilter(line, filter));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-2">
        <select
          aria-label="Log file"
          value={active ?? ""}
          onChange={(e) => void load(e.target.value)}
          className="h-7 max-w-56 rounded-md border border-border bg-background px-2 text-xs"
        >
          {files.length === 0 ? <option value="">No log files yet</option> : null}
          {files.map((file) => (
            <option key={file.name} value={file.name}>
              {file.name} ({Math.max(1, Math.round(file.bytes / 1024))} KB)
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1" role="group" aria-label="Filter log lines">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "h-7 rounded-md px-2 text-xs transition-colors",
                filter === value
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {levelFilterLabel(value)}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[11px] text-muted-foreground">
          {visible.length} of {lines.length} lines
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Refresh" disabled={busy} onClick={() => void load()}>
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void desktop.app.openLogs()}
          title="Open the log folder in your file manager"
        >
          <FolderOpen className="h-3.5 w-3.5" /> Open logs folder
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed">
        {lines.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            This file is empty. Start or use the app for a while, then press Refresh.
          </p>
        ) : (
          visible.map((line, index) => (
            <div key={index} className={cn("whitespace-pre-wrap", levelClass(lineLevel(line)))}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**Manual verification (3 min, desktop app):** `pnpm desktop:dev` → palette → *Logs*. The panel lists `main.log` (P1.T5's backend/electron logs) with its size; the tail shows the most recent lines; *Errors only* filters to lines containing “error”; *Open logs folder* opens the OS file manager at `%APPDATA%/MasarFlow/logs`. Close the app's Next server (Ctrl+C in the dev terminal) → after ≤5 s the tail stops growing but the panel keeps working.

Commit: `feat(desktop): log tail panel with level filtering (bounded, name-validated reads)`

---

## P8.T15 — System / environment panel (read-only, ≈8 min)

This panel is deliberately **read-only**: master D1 assigns the editable environment/config surface to **P10** (Settings → System + AI Providers). P8 answers "what am I running, where is my data, which folders am I allowed to touch" so the rest of the app can link to it — and states the handoff in the UI so nobody adds a second, competing env editor.

**Create `tests/unit/tools/system.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { describeRoot, formatBytes, storageSummary } from "@/lib/tools/system";

describe("formatBytes", () => {
  it("uses human units and never shows a bare number", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024 * 3.5)).toBe("3.5 MB");
    expect(formatBytes(1024 ** 3 * 2)).toBe("2.0 GB");
  });
});

describe("storageSummary", () => {
  it("describes how full the workspace store is", () => {
    expect(storageSummary(100, 100)).toBe("full");
    expect(storageSummary(85, 100)).toBe("nearly full");
    expect(storageSummary(30, 100)).toBe("healthy");
    expect(storageSummary(1, 0)).toBe("unknown");
  });
});

describe("describeRoot", () => {
  it("states allowed / not allowed in the user's words", () => {
    expect(describeRoot("C:\\Games\\Roguelike", true)).toContain("allowed");
    expect(describeRoot("C:\\Games\\Roguelike", false)).toContain("not allowed");
    expect(describeRoot("C:\\Games\\Roguelike", true)).toContain("Roguelike");
  });
});
```

Run: `pnpm test -- tests/unit/tools/system.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/tools/system"`.

**Create `src/lib/tools/system.ts`:**

```ts
/**
 * Formatting helpers for the System info panel. Pure: the panel only renders
 * what Electron and IndexedDB report through the bridge.
 *
 * Pure TypeScript only — no React, Next, DOM, or Electron imports.
 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${units[unit]}`;
}

export type StorageHealth = "healthy" | "nearly full" | "full" | "unknown";

/** Share of the origin quota in use. */
export function storageSummary(usage: number, quota: number): StorageHealth {
  if (!Number.isFinite(quota) || quota <= 0) return "unknown";
  const ratio = usage / quota;
  if (ratio >= 1) return "full";
  if (ratio >= 0.8) return "nearly full";
  return "healthy";
}

/** One line per registered folder, in plain language. */
export function describeRoot(path: string, allowed: boolean): string {
  const name = path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || path;
  return allowed
    ? `${name} — allowed: the agent and the terminal may read and run here.`
    : `${name} — not allowed: link it again in Chat → Linked folders.`;
}
```

Run: `pnpm test -- tests/unit/tools/system.test.ts`
Expected: **PASS** — `Tests 3 passed`.

**Create `src/app/(workspace)/tools/system/page.tsx`:**

```tsx
"use client";

import { SystemPanel } from "@/components/tools/system-panel";

export default function SystemPage() {
  return <SystemPanel />;
}
```

**Create `src/components/tools/system-panel.tsx`:**

```tsx
"use client";

/**
 * System info: versions, paths, the folder allow-list and local storage usage.
 * READ-ONLY by design — the editable environment/settings surface is P10's
 * Settings → System + AI Providers (master D1). Everything here is a fact the
 * app already knows; nothing here changes state.
 */

import { useEffect, useMemo, useState } from "react";
import { Ban, CircleCheck, Copy, FolderOpen, Info, MonitorCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDesktop } from "@/lib/desktop/bridge";
import { db } from "@/lib/db";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { linkedProjectsRepo } from "@/lib/db/repos";
import { describeRoot, formatBytes, storageSummary } from "@/lib/tools/system";
import { pushToast } from "@/lib/stores/toast";

interface AppInfo {
  version: string;
  displayVersion: string;
  userData: string;
  packaged: boolean;
}

interface Row {
  label: string;
  value: string;
  hint?: string;
}

export function SystemPanel() {
  const desktop = useMemo(() => getDesktop(), []);
  const projectId = useActiveProjectId();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [roots, setRoots] = useState<{ path: string; allowed: boolean }[]>([]);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [counts, setCounts] = useState<{ table: string; count: number }[]>([]);

  useEffect(() => {
    void (async () => {
      if (desktop) {
        setInfo(await desktop.app.info());
        const registered = await desktop.roots.list();
        const linked = projectId ? await linkedProjectsRepo.listByProject(projectId) : [];
        const seen = new Set<string>();
        const rows: { path: string; allowed: boolean }[] = [];
        for (const root of linked) {
          seen.add(root.rootPath);
          rows.push({ path: root.rootPath, allowed: await desktop.roots.covers(root.rootPath) });
        }
        for (const path of registered) {
          if (!seen.has(path)) rows.push({ path, allowed: true });
        }
        setRoots(rows);
      }
      if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setStorage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
      }
      const tables: { table: string; count: number }[] = [];
      for (const table of db.tables) {
        tables.push({ table: table.name, count: await table.count() });
      }
      setCounts(tables.sort((a, b) => b.count - a.count));
    })();
  }, [desktop, projectId]);

  const appRows: Row[] = [
    { label: "MasarFlow", value: info ? info.displayVersion : "unknown", hint: "Application version" },
    { label: "Runtime", value: info?.packaged ? "Packaged desktop app" : "Development run", hint: "Packaged builds ship their own server" },
    { label: "Platform", value: desktop ? `${desktop.platform}` : "web browser", hint: "Where the workspace is running" },
    { label: "Data folder", value: info?.userData ?? "Only the desktop app knows this path", hint: "Database, logs and roots.json live here" },
    { label: "Workspace storage", value: storage ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)} (${storageSummary(storage.usage, storage.quota)})` : "measuring…", hint: "Local IndexedDB quota for this origin" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MonitorCog className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-medium">System info</h2>
          <p className="text-xs text-muted-foreground">
            What you are running and where your data is. Read-only — change settings in Settings.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => {
            const report = [...appRows.map((r) => `${r.label}: ${r.value}`), "", "Registered folders:", ...roots.map((r) => describeRoot(r.path, r.allowed))].join("\n");
            void navigator.clipboard.writeText(report);
            pushToast({ title: "Diagnostics copied", tone: "success" });
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Copy diagnostics
        </Button>
      </header>

      <section aria-label="Runtime" className="border-b border-border px-4 py-3">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {appRows.map((row) => (
            <div key={row.label}>
              <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {row.label}
              </dt>
              <dd className="truncate font-mono text-xs" title={row.value}>
                {row.value}
              </dd>
              {row.hint ? <p className="text-[11px] text-muted-foreground">{row.hint}</p> : null}
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Allowed folders" className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Folders the app may use
        </h3>
        {roots.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            None yet. Link a project folder in <span className="font-medium">Chat → Linked folders</span>; the
            agent and the terminal can only work inside those folders.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {roots.map((root) => (
              <li key={root.path} className="flex items-center gap-2 text-xs">
                {root.allowed ? (
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono">{root.path}</span>
                <span className="text-muted-foreground">{describeRoot(root.path, root.allowed)}</span>
              </li>
            ))}
          </ul>
        )}
        {desktop ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => void desktop.app.openLogs()}
          >
            <FolderOpen className="h-3.5 w-3.5" /> Open logs folder
          </Button>
        ) : null}
      </section>

      <section aria-label="Local data" className="px-4 py-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Local data
        </h3>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {counts.map((row) => (
            <li key={row.table} className="flex items-center justify-between text-xs">
              <span className="truncate text-muted-foreground">{row.table}</span>
              <span className="font-mono">{row.count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Editable environment settings (API keys, providers, .env values) arrive with Settings → System +
          AI Providers. This panel stays read-only on purpose so there is exactly one place to change them.
        </p>
      </section>
    </div>
  );
}
```

**Manual verification (2 min):** browser at `http://localhost:3000/tools/system` → Runtime shows *Development run* / *web browser* / a storage line; *Folders the app may use* explains the empty state; Local data lists per-table counts. In the desktop app: version, data folder, `Packaged desktop app`, and the linked folder with a green check. *Copy diagnostics* copies a plain-text report (paste it somewhere to check).

Commit: `feat(tools): read-only system info panel (versions, paths, allowed folders, storage)`

---

## P8.T16 — Today in the sidebar, Tools in the sidebar, and nothing can drift (TDD guard, ≈8 min)

**Decision (A7), stated once:** `/today` is a **new route**, not a rebuilt `/dashboard`. Reasons: (1) `/dashboard` is the boot page of the P1 smoke test, the dock's placeholder page id (`tree.ts:19`) and the first panel of the Development preset — rewriting it risks a P1 gate for no product reason; (2) the two pages answer different questions ("what is going on" vs "what do I do now") and Today's hierarchy (three lists + entry points) shares no widgets with the metric rings; (3) both stay in the dock, so the cost of an extra route is one nav entry plus one loader entry. The sidebar gets a new **Tools** group because terminal/logs/system are machine-level tools, not project data.

**Create `tests/unit/nav-parity.test.ts` (failing until the wiring lands):**

```ts
import { describe, expect, it } from "vitest";
import { ALL_NAV_ITEMS, NAV_GROUPS } from "@/lib/nav";
import { PAGE_PATHS } from "@/lib/dock/registry";
import { readSources } from "./_helpers/fs-scan";

const loader = () => readSources().find((s) => s.path === "src/components/dock/panel-loader.tsx")?.text ?? "";
const routeFiles = () => readSources().map((s) => s.path);

describe("navigation integrity", () => {
  it("every nav item is a dock page", () => {
    for (const item of ALL_NAV_ITEMS) {
      expect(PAGE_PATHS, item.href).toContain(item.href);
    }
  });

  it("every nav item has a route file and a loader entry", () => {
    const files = routeFiles();
    const source = loader();
    for (const path of PAGE_PATHS) {
      const file = `src/app/(workspace)${path}/page.tsx`;
      expect(files, path).toContain(file);
      expect(source, path).toContain(`"${path}": dynamic(`);
    }
  });

  it("no two nav items share an href", () => {
    const seen = new Set<string>();
    for (const item of ALL_NAV_ITEMS) {
      expect(seen.has(item.href), item.href).toBe(false);
      seen.add(item.href);
    }
  });

  it("label every group with a plain-language name", () => {
    for (const group of NAV_GROUPS) {
      expect(group.label.length).toBeGreaterThan(2);
      expect(group.label).not.toBe(group.label.toUpperCase());
    }
  });
});
```

Run: `pnpm test -- tests/unit/nav-parity.test.ts`
Expected: **FAIL** — `expected [ … ] to contain "src/app/(workspace)/today/page.tsx"` (and the same for the three `/tools/*` routes) until those files exist.

**Edit `src/lib/nav.ts`:**

1. Add `CalendarDays, MonitorCog, SquareTerminal` to the existing `lucide-react` import at the top of the file.
2. In the **Work** group (`src/lib/nav.ts:93-107`), insert as the first item:
```ts
      {
        label: "Today",
        href: "/today",
        icon: CalendarDays,
        keywords: ["today", "now", "due", "overdue", "in progress", "focus", "daily"],
      },
```
3. Append a new group after the **System** group (after `src/lib/nav.ts:167`, before the closing `];` at line 168):
```ts
  // ── Tools: things that touch this machine — desktop app only ─────────────
  {
    label: "Tools",
    icon: SquareTerminal,
    items: [
      {
        label: "Terminal",
        href: "/tools/terminal",
        icon: SquareTerminal,
        keywords: ["shell", "console", "command", "powershell", "cmd", "bash"],
      },
      {
        label: "Logs",
        href: "/tools/logs",
        icon: ScrollText,
        keywords: ["diagnostics", "errors", "output", "server log"],
      },
      {
        label: "System Info",
        href: "/tools/system",
        icon: MonitorCog,
        keywords: ["version", "paths", "storage", "environment", "allowed folders"],
      },
    ],
  },
```
(`ScrollText` is already imported in `nav.ts` — used at line 105.)

4. Create the four route files (the three tools routes are created in T13/T14/T15 — create the Today one now as a placeholder that T17/T18 replace):
```bash
mkdir -p "src/app/(workspace)/today" "src/app/(workspace)/tools/terminal" "src/app/(workspace)/tools/logs" "src/app/(workspace)/tools/system"
```
`src/app/(workspace)/today/page.tsx` — a **self-contained** placeholder, because the repo must `typecheck` at every commit and `today-view.tsx` does not exist until T18:

```tsx
"use client";

/**
 * Today — placeholder; T18 replaces this body with the real view. It must not
 * import `@/components/today/today-view` yet, or the T16 commit does not
 * typecheck.
 */
export default function TodayPage() {
  return (
    <div className="p-6 text-sm text-muted-foreground">
      Today view — built in the next task.
    </div>
  );
}
```

5. Add the four `"path": dynamic(...)` entries to `PAGE_COMPONENTS` (T5 step 1 lists the exact lines).

Run: `pnpm test -- tests/unit/nav-parity.test.ts`
Expected: **PASS** — `Tests 4 passed`. Then `pnpm typecheck` → exit 0.

**Manual verification (1 min):** `pnpm dev` → the sidebar shows *Today* at the top of **Work** and a **Tools** group with *Terminal*, *Logs*, *System Info*. Click each: as a dock panel when the dock is on, as a classic page when it is off (`Settings → Workspace → Dock window manager`). `⌘/Ctrl+K` → typing “log” lists *Logs* under Go to.

Commit: `feat(nav): Today route and Tools group (terminal, logs, system info) with a parity guard test`

---

## P8.T17 — Due dates on tasks + the Today model (pure, TDD, ≈10 min)

**Create `tests/unit/lib/today/model.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/db/schema";
import { bucketOf, dayKey, endOfDay, groupTasks, startOfDay } from "@/lib/today/model";

const DAY = 24 * 60 * 60 * 1000;
// 2026-10-16 12:00 local (the test machine is UTC+3, so local != UTC here).
const NOON = new Date(2026, 9, 16, 12, 0, 0).getTime();

/** Exactly the real Task shape (src/lib/db/schema.ts:231-243) — no other fields exist. */
function task(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    projectId: "p1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "medium",
    specId: null,
    sprintId: null,
    parentTaskId: null,
    assignee: "human", // assigneeSchema enum: human | ai | architect | programmer | reviewer | tester | …
    dependencies: [],
    progress: 0,
    tags: [],
    dueDate: null,
    createdAt: NOON,
    updatedAt: NOON,
    ...overrides,
  };
}

describe("dayKey / startOfDay / endOfDay", () => {
  it("formats in LOCAL time, not UTC", () => {
    expect(dayKey(NOON)).toBe("2026-10-16");
    expect(dayKey(new Date(2026, 9, 16, 1, 0, 0).getTime())).toBe("2026-10-16");
  });

  it("start/end bracket the local day", () => {
    expect(new Date(startOfDay(NOON)).getHours()).toBe(0);
    expect(dayKey(startOfDay(NOON) - 1)).toBe("2026-10-15");
    expect(dayKey(endOfDay(NOON))).toBe("2026-10-16");
    expect(endOfDay(NOON)).toBe(startOfDay(NOON) + DAY - 1);
  });
});

describe("bucketOf", () => {
  it("sorts by due date first, then by status, then by priority", () => {
    expect(bucketOf(task({ dueDate: NOON - DAY }), NOON)).toBe("overdue");
    expect(bucketOf(task({ dueDate: NOON }), NOON)).toBe("dueToday");
    expect(bucketOf(task({ status: "in_progress" }), NOON)).toBe("inProgress");
    expect(bucketOf(task({ status: "review" }), NOON)).toBe("inProgress");
    expect(bucketOf(task({ priority: "urgent" }), NOON)).toBe("upNext");
    expect(bucketOf(task({ priority: "high" }), NOON)).toBe("upNext");
  });

  it("drops finished work and unremarkable backlog", () => {
    expect(bucketOf(task({ status: "done" }), NOON)).toBeNull();
    expect(bucketOf(task({ status: "todo", priority: "low" }), NOON)).toBeNull();
    expect(bucketOf(task({ status: "backlog", priority: "medium" }), NOON)).toBeNull();
  });

  it("a task due tomorrow is not on today's list", () => {
    expect(bucketOf(task({ dueDate: NOON + DAY }), NOON)).toBeNull();
  });
});

describe("groupTasks", () => {
  const tasks = [
    task({ id: "a", title: "overdue", dueDate: NOON - DAY }),
    task({ id: "b", title: "due", dueDate: NOON }),
    task({ id: "c", title: "doing", status: "in_progress", updatedAt: NOON - 1000 }),
    task({ id: "d", title: "urgent", priority: "urgent" }),
    task({ id: "e", title: "done", status: "done" }),
  ];

  it("returns four ordered lists, newest work first inside each", () => {
    const grouped = groupTasks(tasks, NOON);
    expect(grouped.overdue.map((t) => t.title)).toEqual(["overdue"]);
    expect(grouped.dueToday.map((t) => t.title)).toEqual(["due"]);
    expect(grouped.inProgress.map((t) => t.title)).toEqual(["doing"]);
    expect(grouped.upNext.map((t) => t.title)).toEqual(["urgent"]);
  });

  it("counts every bucket so the UI can show totals", () => {
    expect(groupTasks(tasks, NOON).counts).toEqual({
      overdue: 1,
      dueToday: 1,
      inProgress: 1,
      upNext: 1,
    });
  });

  it("is deterministic for an empty project", () => {
    expect(groupTasks([], NOON).all).toEqual([]);
  });
});
```

Run: `pnpm test -- tests/unit/lib/today/model.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/today/model"` (and after the module exists, the `dueDate` assertions fail until T17's schema change lands).

**Add the field (non-indexed, no Dexie bump — `schema.ts:218-220` documents this precedent):**

1. `src/lib/db/schema.ts` — in `taskSchema`, next to `priority`, add:
```ts
  /**
   * When the task should be finished (ms epoch, start of the local day it is
   * due) or null when it has no deadline. NOT indexed — added without a Dexie
   * version bump (same precedent as standardSchema.pattern); the Today view
   * filters in memory over at most a few hundred rows.
   */
  dueDate: z.number().nullable().default(null),
```
2. `src/lib/db/repos/tasks.ts` — add to `normalize`:
```ts
    dueDate: t.dueDate ?? null,
```
3. Write helpers — **create `src/lib/today/tasks.ts`:**
```ts
/**
 * The only writer of task due dates. Storing the START of the local day keeps
 * "overdue" a date question, never a time question (a task due today is never
 * overdue at 09:00).
 *
 * Note: the machine's timezone is what the user sees; do not use toISOString
 * anywhere in this file — it would shift the day for UTC+3 (see dayKey tests).
 */

import { db } from "@/lib/db";
import { now } from "@/lib/utils/ids";
import { startOfDay } from "./model";

/** Set (or move) a task's due date to the local day of `when`. */
export async function setTaskDue(taskId: string, when: number): Promise<void> {
  await db.tasks.update(taskId, { dueDate: startOfDay(when), updatedAt: now() });
}

/** Remove the deadline. */
export async function clearTaskDue(taskId: string): Promise<void> {
  await db.tasks.update(taskId, { dueDate: null, updatedAt: now() });
}

```

**Create `src/lib/today/model.ts`:**

```ts
/**
 * The Today view's brain: which tasks belong in which list, and what "today"
 * means. Pure — the view supplies `Date.now()` and the rows.
 *
 * Ordering rules (documented because the UI must not re-sort):
 *   overdue   -> earliest due first (worst first)
 *   dueToday  -> priority (urgent, high, medium, low), then most recently updated
 *   inProgress-> most recently updated first
 *   upNext    -> priority, then most recently updated
 *
 * Pure TypeScript only — no React, Next, DOM, or Dexie imports.
 */

import type { Task } from "@/lib/db/schema";

export type TodayBucket = "overdue" | "dueToday" | "inProgress" | "upNext";
export const TODAY_BUCKETS: TodayBucket[] = ["overdue", "dueToday", "inProgress", "upNext"];

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Local midnight of the day containing `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Last millisecond of the local day containing `ts`. */
export function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** "YYYY-MM-DD" in LOCAL time — never toISOString (it shifts the day). */
/* Named `dayKey` to match P7's wording (P7 plan, src/lib/vault/daily.ts) — P7's takes a `Date`, this one a
 * timestamp, and both must resolve the same local day. If P7 ever exports a shared `dayKey`, delete this one and
 * import theirs; the T17 test (`dayKey`/`startOfDay`/`endOfDay` cases) is what keeps the behaviour pinned until then. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Which Today list a task belongs in, or null when it is not today's business. */
export function bucketOf(task: Task, now: number): TodayBucket | null {
  if (task.status === "done") return null;
  const due = task.dueDate ?? null;
  if (due !== null && due < startOfDay(now)) return "overdue";
  if (due !== null && due <= endOfDay(now)) return "dueToday";
  if (task.status === "in_progress" || task.status === "review") return "inProgress";
  if (task.status === "todo" && (task.priority === "urgent" || task.priority === "high")) {
    return "upNext";
  }
  return null;
}

export interface TodayGroups {
  overdue: Task[];
  dueToday: Task[];
  inProgress: Task[];
  upNext: Task[];
  counts: Record<TodayBucket, number>;
  /** Every task that made it onto the page, in display order. */
  all: Task[];
}

function byPriorityThenUpdated(a: Task, b: Task): number {
  const rank = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  return rank !== 0 ? rank : b.updatedAt - a.updatedAt;
}

export function groupTasks(tasks: Task[], now: number = Date.now()): TodayGroups {
  const groups: TodayGroups = {
    overdue: [],
    dueToday: [],
    inProgress: [],
    upNext: [],
    counts: { overdue: 0, dueToday: 0, inProgress: 0, upNext: 0 },
    all: [],
  };

  for (const task of tasks) {
    const bucket = bucketOf(task, now);
    if (!bucket) continue;
    groups[bucket].push(task);
  }

  groups.overdue.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
  groups.dueToday.sort(byPriorityThenUpdated);
  groups.inProgress.sort((a, b) => b.updatedAt - a.updatedAt);
  groups.upNext.sort(byPriorityThenUpdated);

  for (const bucket of TODAY_BUCKETS) {
    groups.counts[bucket] = groups[bucket].length;
    groups.all.push(...groups[bucket]);
  }
  return groups;
}
```

Run: `pnpm test -- tests/unit/lib/today/model.test.ts`
Expected: **PASS** — `Tests 7 passed`. Then `pnpm test` → all green, and `pnpm typecheck` → exit 0. If `typecheck` reports `Property 'dueDate' is missing` for a test fixture that builds a `Task` literal, add `dueDate: null` there — `.default(null)` covers runtime rows, but TS literals are checked structurally. Find them with `rg -n "status: \"todo\"|Partial<Task>" tests | head`.

Commit: `feat(today): task due dates (non-indexed) and the pure Today grouping model`

---

## P8.T18 — The Today view (UI, ≈14 min)

**Create `src/lib/utils/relative-time.ts` + test (pure, TDD, ≈2 min):**

`tests/unit/utils/relative-time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "@/lib/utils/relative-time";

const NOW = new Date(2026, 9, 16, 12, 0, 0).getTime();
const MIN = 60 * 1000;

describe("formatRelativeTime", () => {
  it("counts up in the units a person would use", () => {
    expect(formatRelativeTime(NOW - 5 * 1000, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - MIN, NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(NOW - 59 * MIN, NOW)).toBe("59 minutes ago");
    expect(formatRelativeTime(NOW - 3 * 60 * MIN, NOW)).toBe("3 hours ago");
    expect(formatRelativeTime(NOW - 2 * 24 * 60 * MIN, NOW)).toBe("2 days ago");
  });

  it("falls back to a plain date after a week and never goes negative", () => {
    const old = NOW - 30 * 24 * 60 * MIN;
    expect(formatRelativeTime(old, NOW)).toBe(new Date(old).toLocaleDateString());
    expect(formatRelativeTime(NOW + MIN, NOW)).toBe("just now");
  });
});
```

Run: `pnpm test -- tests/unit/utils/relative-time.test.ts` → **FAIL** (`Failed to resolve import "@/lib/utils/relative-time"`). Then create the module:

```ts
/**
 * "3 minutes ago" timestamps for feeds (the Today activity list). Fixed unit
 * boundaries and no Intl: the wording is asserted in tests and must not drift
 * with the ICU version. `now` is injectable for exactly that reason.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(ts).toLocaleDateString();
}
```

Run → **PASS** — `Tests 2 passed`.

**Create `src/components/today/today-task-list.tsx`:**

```tsx
"use client";

/**
 * One Today bucket: a titled list with a due-date control per row. Every row
 * can be opened in the dock (EntityChip semantics, P5) and its deadline set to
 * today or cleared — the two actions that make this list worth having.
 */

import { CalendarDays, CircleSlash, Timer } from "lucide-react";
import type { Task } from "@/lib/db/schema";
import { openEntity } from "@/lib/entities/open";
import { Button } from "@/components/ui/button";
import { clearTaskDue, setTaskDue } from "@/lib/today/tasks";
import { dayKey, type TodayBucket } from "@/lib/today/model";
import { cn } from "@/lib/utils/cn";

const PRIORITY_CLASS: Record<string, string> = {
  urgent: "text-destructive",
  high: "text-amber-500",
  medium: "text-muted-foreground",
  low: "text-muted-foreground/70",
};

export function TodayTaskList({
  bucket,
  title,
  description,
  tasks,
  emptyText,
}: {
  bucket: TodayBucket;
  title: string;
  description: string;
  tasks: Task[];
  emptyText: string;
}) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-card">
      <header className="flex items-baseline gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
        <p className="ml-auto text-[11px] text-muted-foreground">{description}</p>
      </header>
      {tasks.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0">
              <button
                type="button"
                onClick={() => openEntity({ kind: "task", id: task.id })}
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                title="Open in the dock"
              >
                {task.title}
              </button>
              {task.dueDate !== null ? (
                <span className={cn("shrink-0 text-[11px]", bucket === "overdue" && "text-destructive")}>
                  {bucket === "overdue" ? "Overdue since " : "Due "}
                  {dayKey(task.dueDate)}
                </span>
              ) : null}
              <span className={cn("shrink-0 text-[11px] uppercase", PRIORITY_CLASS[task.priority])}>
                {task.priority}
              </span>
              {bucket === "overdue" || bucket === "dueToday" ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Clear the deadline of ${task.title}`}
                  title="Clear the deadline"
                  onClick={() => void clearTaskDue(task.id)}
                >
                  <CircleSlash className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Set the deadline of ${task.title} to today`}
                  title="Due today"
                  onClick={() => void setTaskDue(task.id, Date.now())}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {bucket === "inProgress" ? (
        <p className="flex items-center gap-1.5 px-3 pb-2 text-[11px] text-muted-foreground">
          <Timer className="h-3 w-3" /> In review counts as in progress.
        </p>
      ) : null}
    </section>
  );
}
```

**Create `src/components/today/today-activity.tsx`:**

```tsx
"use client";

/**
 * Recent activity (P5 activity table). Renders the same EntityChips the rest
 * of the app uses, so a row here is the same object as a row in a backlinks
 * section — one entity language, no parallel link format.
 */

import { Activity as ActivityIcon } from "lucide-react";
import { activityRepo } from "@/lib/db/repos/activity";
import type { Activity } from "@/lib/db/schema";
import { EntityChip } from "@/components/entities/entity-chip";
import { useLiveQuery } from "dexie-react-hooks";
import { formatRelativeTime } from "@/lib/utils/relative-time";

export function TodayActivity({ projectId }: { projectId: string }) {
  const rows =
    useLiveQuery(() => activityRepo.listRecent(projectId, 15), [projectId], undefined) ?? [];

  return (
    <section aria-label="Recent activity" className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ActivityIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-medium">Recent activity</h3>
        <p className="ml-auto text-[11px] text-muted-foreground">Last 15 changes</p>
      </header>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Nothing yet today. Create a task or a note and it appears here.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row: Activity) => (
            <li key={row.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{row.summary}</span>
              <EntityChip entity={{ kind: row.entityKind, id: row.entityId }} />
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatRelativeTime(row.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

(`activityRepo.listRecent(projectId, limit)` and the `Activity` row `{id, projectId, entityKind, entityId, op, summary, createdAt}` are exactly what P5.T7 defines (P5 plan lines 924-987) — `summary` is already human-readable, so P8 must not add a parallel describer. `EntityChip({ entity })` is P5.T6b (P5 plan line 655). `formatRelativeTime` is created above in this task.)

**Create `src/components/today/today-view.tsx`:**

```tsx
"use client";

/**
 * Today: the answer to "what do I do now". Three task buckets from the local
 * database, the recent activity feed, today's note, and (when P6 is merged) the
 * git card. Everything here is a link into the dock — this page never edits a
 * task in place beyond its deadline.
 */

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ListChecks, RefreshCw } from "lucide-react";
import { tasksRepo } from "@/lib/db/repos";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { groupTasks } from "@/lib/today/model";
import { openDailyNote } from "@/lib/vault/daily";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TodayTaskList } from "./today-task-list";
import { TodayActivity } from "./today-activity";
import { TodayGit } from "./today-git";

export function TodayView() {
  const projectId = useActiveProjectId();
  const tasks = useLiveQuery(
    () => (projectId ? tasksRepo.listByProject(projectId) : Promise.resolve([])),
    [projectId],
    undefined,
  );

  const grouped = useMemo(() => groupTasks(tasks ?? [], Date.now()), [tasks]);
  const now = new Date();

  if (!projectId) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No project yet"
        description="Create or open a project to see today's work."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-medium">
            Today — {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {grouped.counts.overdue + grouped.counts.dueToday === 0
              ? "Nothing is due today. The lists below are what moved most recently."
              : `${grouped.counts.overdue} overdue, ${grouped.counts.dueToday} due today.`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void openDailyNote(projectId)}>
            <CalendarDays className="h-3.5 w-3.5" /> Open today's note
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Re-read the task list"
            title="Refresh"
            onClick={() => useLiveQuery /* live queries refresh on their own */}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
        <TodayTaskList
          bucket="overdue"
          title="Overdue"
          description="Deadline passed"
          tasks={grouped.overdue}
          emptyText="Nothing is late."
        />
        <TodayTaskList
          bucket="dueToday"
          title="Due today"
          description="Finish before the day ends"
          tasks={grouped.dueToday}
          emptyText="Nothing is due today."
        />
        <TodayTaskList
          bucket="inProgress"
          title="In progress"
          description="Already started — most recent first"
          tasks={grouped.inProgress}
          emptyText="Nothing is in progress."
        />
        <TodayTaskList
          bucket="upNext"
          title="Up next"
          description="High and urgent work not started"
          tasks={grouped.upNext}
          emptyText="No high-priority work waiting."
        />

        <TodayGit projectId={projectId} />
        <TodayActivity projectId={projectId} />
      </div>

      <footer className="mt-auto border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <ListChecks className="mr-1.5 inline h-3.5 w-3.5" />
        Everything here links into the dock: a task opens in Task Boards, a change opens in its page. Use
        ⌘/Ctrl+K to find anything else.
      </footer>
    </div>
  );
}
```

Remove the no-op refresh button (it is dishonest) — either drop it or wire it to a real `useLiveQuery` dependency bump:

```tsx
  const [refreshKey, setRefreshKey] = useState(0);
  const tasks = useLiveQuery(
    () => (projectId ? tasksRepo.listByProject(projectId) : Promise.resolve([])),
    [projectId, refreshKey],
    undefined,
  );
  …
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Re-read the task list"
            title="Refresh"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
```

**Daily-note entry point: consume P7 — do not re-implement it.**

P7's plan publishes exactly one entry point in `src/lib/vault/daily.ts` (`.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p7-vault.md`, the block headed *"P8 CONTRACT — the Today view imports exactly this"*):

```ts
export async function openDailyNote(projectId: string, date?: Date): Promise<{ noteId: string }>;
```

and states the rule in as many words: *"P8 must not create its own daily note; it calls openDailyNote so the day, the tags, the `day` property and the file path stay in one place."* P7 also owns the `YYYY-MM-DD` title, the `day` frontmatter property and the `daily/<YYYY-MM-DD>.md` mirror path.

So P8 adds **no** `src/lib/today/daily-note.ts` and no `dailyNoteTitle`/`findDailyNote`/`openDailyNote` of its own — `today-view.tsx` imports `openDailyNote` from `@/lib/vault/daily` and calls it from the button. The behaviour the button must have is the manual check below (one button, first press creates, every press focuses; never a second note for the same day).

*(This is the same rule as T19's git card: P8 owns presentation, the data layer belongs to the phase that built it. If P7's `openDailyNote` is ever renamed, this is the single call site — the manual check in step 3 below is what catches it.)*

**Manual verification (3 min):** `pnpm dev` → `/today`. With demo data loaded, four buckets show counts; a task's *Due today* button sets the deadline and the row moves to *Due today* (live, no reload); *Clear the deadline* removes the label. Click a task title → the Task Boards panel focuses with that task selected (P5 `openEntity`). *Open today's note* → the Brain panel focuses a note titled with today's date; pressing the button again keeps the same note. The activity feed lists recent changes with relative times; the git card shows its placeholder until P6 lands (T19).

Commit: `feat(today): today view (buckets, due dates, activity feed, daily note entry point)`

---

## P8.T19 — The git card in Today (depends on P6; run only after P6 is merged, ≈6 min)

**Contract consumed (P8 implements none of it).** P6 ships it in two places (`.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p6-git-github.md`, T1 and T10):

```ts
// @shared/git  (desktop/src/shared/git.ts, mirrored for the renderer — P6 plan lines 230-262)
export type GitStatusLetter = "." | "M" | "T" | "A" | "D" | "R" | "C" | "U" | "?";

export interface GitFileChange {
  path: string;              // repo-root-relative, forward slashes
  origPath: string | null;   // rename/copy source, else null
  index: GitStatusLetter;    // staged column of `git status --porcelain=v2`
  worktree: GitStatusLetter; // unstaged column
  conflicted: boolean;
}

export interface GitRepoStatus {
  head: string;        // branch name, or "HEAD" when detached
  detached: boolean;
  oid: string;         // full HEAD id, all zeros before the first commit
  upstream: string | null;  // e.g. "origin/main"
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: GitFileChange[];
}

// src/lib/git/use-git-repo.ts  (P6.T10)  — GitRepo = ReturnType<typeof useGitRepo>
export function useGitRepo(): GitRepo;
// state it returns (GitRepoState, P6 plan lines 2466-2476):
//   root: string | null; branch: string | null; detached: boolean;
//   loading: boolean; error: GitRepoError | null; status: GitRepoStatus | null;
// plus roots / refresh / selectRoot / pickRoot.
```

Confirm what actually landed before writing a line:

```bash
rg -n "export function useGitRepo|export interface GitRepoStatus" src/lib/git desktop/src/shared
```

If P6 shipped different names, use **its** names — this file is the only place that imports them (the same rule T18 applies to P7's `openDailyNote`). **Do not** add a `src/lib/git/*` file of your own: P8 introduces no git code, no second status hook, and no porcelain parsing (there is already a `src/components/git/git-status-panel.tsx` from P6 for the full view; the card below is the one-line summary).

**Create `src/components/today/today-git.tsx`:**

```tsx
"use client";

/**
 * Repository card. P6 owns git end to end (main-process `execFile`, the root
 * allow-list, the porcelain-v2 parser, the hook); this card only decides how to
 * say it. The hook exposes loading / error / status separately, so all four
 * states are honest — reading, desktop unavailable or no repository, a read
 * failure, and a real status. Nothing here runs git, and nothing here invents
 * a second status source.
 */

import { GitBranch, GitCommitHorizontal, RefreshCw, TriangleAlert } from "lucide-react";
import { useGitRepo } from "@/lib/git/use-git-repo";
import { Button } from "@/components/ui/button";

export function TodayGit() {
  const repo = useGitRepo();

  const changed =
    repo.status === null
      ? 0
      : repo.status.staged.length + repo.status.unstaged.length + repo.status.untracked.length;
  const noCommits = repo.status !== null && /^0+$/.test(repo.status.oid);

  return (
    <section aria-label="Repository" className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-medium">Repository</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Re-read the repository status"
          title="Refresh"
          onClick={() => void repo.refresh()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </header>

      {repo.loading && repo.status === null ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">Reading the repository…</p>
      ) : repo.error !== null ? (
        <p className="flex items-start gap-2 px-3 py-4 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Git could not be read ({repo.error.code}). Open the Git panel for the full message.
          </span>
        </p>
      ) : repo.status === null || repo.root === null ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          No Git repository is linked to this project. Link the folder that contains it in{" "}
          <span className="font-medium">Chat → Linked folders</span>.
        </p>
      ) : (
        <div className="space-y-2 px-3 py-3 text-xs">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{repo.status.head}</span>
            {repo.status.upstream === null ? (
              <span className="text-muted-foreground">no upstream</span>
            ) : null}
            {repo.status.ahead > 0 ? (
              <span className="text-muted-foreground">{repo.status.ahead} to push</span>
            ) : null}
            {repo.status.behind > 0 ? (
              <span className="text-muted-foreground">{repo.status.behind} to pull</span>
            ) : null}
            {repo.status.conflicted.length > 0 ? (
              <span className="text-destructive">
                {repo.status.conflicted.length} conflicted
              </span>
            ) : changed > 0 ? (
              <span className="text-amber-500">{changed} uncommitted</span>
            ) : (
              <span className="text-emerald-500">clean</span>
            )}
          </p>
          {repo.status.conflicted.length > 0 ? (
            <p className="text-destructive">Resolve the conflicts before continuing.</p>
          ) : null}
          <p className="flex items-start gap-2 text-muted-foreground">
            <GitCommitHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-foreground">
                {noCommits ? "No commits yet" : `HEAD ${repo.status.oid.slice(0, 8)}`}
              </span>
              <span className="block">
                {repo.status.detached ? "detached HEAD" : `on ${repo.status.head}`}
              </span>
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
```

**Manual verification (2 min, after P6):** with a linked folder that *is* a git repo with uncommitted changes, `/today` shows the branch name, `N uncommitted` (or `N conflicted`), and `HEAD <short sha>`; after committing, pressing *Refresh* turns the badge to *clean*; a repo whose HEAD is still all zeros shows *No commits yet*; a project with no repository (or the browser build, where the desktop bridge is absent) shows the *No Git repository is linked* sentence instead of an error — that is the state that must never become a red box.

Commit: `feat(today): repository card wired to the P6 git status hook`

---

## P8.T20 — Command registry: one list of everything you can do (pure, TDD, ≈10 min)

**Create `tests/unit/commands/registry.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { buildCommands, type CommandContext } from "@/lib/commands/registry";
import { filterCommands, isCommandAvailable } from "@/lib/commands/filter";

const CTX: CommandContext = {
  dockEnabled: true,
  hasProject: true,
  projectId: "p1",
  theme: "dark",
  projects: [
    { id: "p1", name: "MasarFlow" },
    { id: "p2", name: "Roguelike" },
  ],
  desktopAvailable: true,
};

describe("buildCommands", () => {
  it("produces unique ids and non-empty labels", () => {
    const commands = buildCommands(CTX);
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of commands) {
      expect(command.label.length).toBeGreaterThan(2);
      expect(command.group.length).toBeGreaterThan(1);
      expect(typeof command.run).toBe("function");
    }
  });

  it("covers dock, tools, navigation, project, appearance and data", () => {
    const groups = new Set(buildCommands(CTX).map((c) => c.group));
    for (const group of ["Panels", "Dock", "Tools", "Go to", "Project", "Appearance", "Data"]) {
      expect(groups, group).toContain(group);
    }
  });

  it("opens every dock page and every tool panel", () => {
    const commands = buildCommands(CTX);
    for (const href of ["/today", "/dashboard", "/tools/terminal", "/tools/logs", "/tools/system"]) {
      expect(commands.some((c) => c.id === `open:${href}`), href).toBe(true);
    }
  });

  it("offers one command per project, never for the active one", () => {
    const commands = buildCommands(CTX).filter((c) => c.id.startsWith("project:"));
    expect(commands.map((c) => c.id)).toEqual(["project:p2"]);
    expect(commands[0].label).toBe("Switch to Roguelike");
  });

  it("hides dock-only and desktop-only commands when they cannot run", () => {
    const webCtx: CommandContext = { ...CTX, dockEnabled: false, desktopAvailable: false };
    const ids = buildCommands(webCtx).map((c) => c.id);
    expect(ids).not.toContain("dock:float");
    expect(ids).not.toContain("open:/tools/terminal");
    expect(ids).not.toContain("tool:open-logs-folder");
  });

  it("never exposes a destructive command without a confirmation path", () => {
    for (const command of buildCommands(CTX)) {
      if (command.tone !== "danger") continue;
      expect(command.confirm, command.id).toBeTruthy();
    }
  });
});

describe("filterCommands", () => {
  const commands = buildCommands(CTX);

  it("matches label, group and keywords", () => {
    expect(filterCommands(commands, "terminal").map((c) => c.id)).toContain("open:/tools/terminal");
    expect(filterCommands(commands, "shell").map((c) => c.id)).toContain("open:/tools/terminal");
    expect(filterCommands(commands, "float").map((c) => c.id)).toContain("dock:float");
  });

  it("ranks a label prefix above a keyword hit", () => {
    const result = filterCommands(commands, "today");
    expect(result[0].id).toBe("open:/today");
  });

  it("returns everything (capped) for an empty query", () => {
    expect(filterCommands(commands, "").length).toBeGreaterThan(5);
    expect(filterCommands(commands, "   ").length).toBe(filterCommands(commands, "").length);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filterCommands(commands, "zzzzz")).toEqual([]);
  });

  it("filters by mode chips", () => {
    const dockOnly = filterCommands(commands, "", "dock");
    expect(dockOnly.every((c) => c.group === "Dock")).toBe(true);
    const gotoOnly = filterCommands(commands, "", "go");
    expect(gotoOnly.every((c) => c.group === "Go to")).toBe(true);
  });

  it("availability respects the context", () => {
    expect(isCommandAvailable({ id: "x", label: "X", group: "Dock", run: () => {}, tone: "default" }, CTX)).toBe(true);
  });
});
```

Run: `pnpm test -- tests/unit/commands/registry.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/commands/registry"`.

**Create `src/lib/commands/registry.ts`:**

```ts
/**
 * Every action the palette can run, as data. One list, built per context, so
 * the palette stays a renderer and this module stays testable.
 *
 * Rules the tests enforce:
 * - ids are unique and stable ("open:/tools/terminal", "dock:float");
 * - a command is only offered when it can actually run (dock on, project open,
 *   desktop app present);
 * - a destructive command carries `confirm` copy, which the palette turns into
 *   the shared ConfirmDialog — never a one-click wipe.
 *
 * Pure TypeScript only — no React, Next, DOM, or Dexie imports. Actions are
 * injected through the context so this file never imports the dock store.
 */

export type CommandTone = "default" | "danger";

export interface CommandContext {
  dockEnabled: boolean;
  hasProject: boolean;
  projectId: string | null;
  theme: "light" | "dark";
  projects: { id: string; name: string }[];
  desktopAvailable: boolean;
}

export interface Command {
  id: string;
  /** What it does, in the user's words. */
  label: string;
  group: "Panels" | "Dock" | "Tools" | "Go to" | "Project" | "Appearance" | "Data";
  /** Extra search terms (never shown). */
  keywords?: string[];
  /** Shown on the right of the row. */
  hint?: string;
  tone?: CommandTone;
  /** Confirmation copy for destructive commands. */
  confirm?: { title: string; body: string; confirmLabel: string };
  run: () => void | Promise<void>;
}

export const DOCK_PAGES: { href: string; label: string }[] = [
  { href: "/today", label: "Today" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Task Boards" },
  { href: "/chat", label: "Chat" },
  { href: "/brain", label: "Notes" },
  { href: "/specs", label: "Specifications" },
  { href: "/docs", label: "Documentation" },
  { href: "/settings", label: "Settings" },
];

export const TOOL_PAGES: { href: string; label: string; keywords: string[] }[] = [
  { href: "/tools/terminal", label: "Terminal", keywords: ["shell", "console", "command", "powershell"] },
  { href: "/tools/logs", label: "Logs", keywords: ["diagnostics", "errors", "output"] },
  { href: "/tools/system", label: "System Info", keywords: ["version", "storage", "environment", "paths"] },
];

/**
 * Build the command list for a context. `actions` carries the side effects, so
 * the registry stays pure and every command is trivially testable.
 */
export interface CommandActions {
  navigate: (href: string) => void;
  openPanel: (panelId: string) => void;
  closeFocusedPanel: () => void;
  floatFocusedPanel: () => void;
  toggleMaximizeFocused: () => void;
  resetWorkspace: () => void;
  copyLayout: () => void;
  pasteLayout: () => void;
  toggleTheme: () => void;
  switchProject: (projectId: string) => void;
  newTask: () => void;
  newNote: () => void;
  openDailyNote: () => void;
  openLogsFolder: () => void;
  resetAllData: () => void;
  isEntityOpen: (href: string) => boolean;
}

export function buildCommands(ctx: CommandContext, actions: CommandActions): Command[] {
  const commands: Command[] = [];

  // Pages (always available — this is the app's navigation).
  for (const page of DOCK_PAGES) {
    commands.push({
      id: `open:${page.href}`,
      label: `Open ${page.label}`,
      group: "Panels",
      keywords: [page.label.toLowerCase()],
      hint: ctx.dockEnabled ? "Dock panel" : "Page",
      run: () => actions.navigate(page.href),
    });
  }

  // Tool panels: desktop app only.
  if (ctx.desktopAvailable) {
    for (const tool of TOOL_PAGES) {
      commands.push({
        id: `open:${tool.href}`,
        label: `Open ${tool.label}`,
        group: "Tools",
        keywords: tool.keywords,
        hint: "Desktop app",
        run: () => actions.navigate(tool.href),
      });
    }
    commands.push({
      id: "tool:open-logs-folder",
      label: "Open the logs folder",
      group: "Tools",
      keywords: ["diagnostics", "explorer", "finder"],
      run: () => actions.openLogsFolder(),
    });
  }

  if (ctx.dockEnabled && ctx.hasProject) {
    commands.push(
      {
        id: "dock:float",
        label: "Float the focused panel",
        group: "Dock",
        keywords: ["window", "undock"],
        hint: "Alt+F",
        run: () => actions.floatFocusedPanel(),
      },
      {
        id: "dock:maximize",
        label: "Maximize / restore the focused panel",
        group: "Dock",
        keywords: ["full", "fill"],
        hint: "Alt+M",
        run: () => actions.toggleMaximizeFocused(),
      },
      {
        id: "dock:close",
        label: "Close the focused panel",
        group: "Dock",
        keywords: ["hide", "remove"],
        hint: "Alt+W",
        run: () => actions.closeFocusedPanel(),
      },
      {
        id: "dock:reset-workspace",
        label: "Reset this workspace to its preset layout",
        group: "Dock",
        keywords: ["restore", "default", "layout"],
        run: () => actions.resetWorkspace(),
      },
      {
        id: "dock:copy-layout",
        label: "Copy this layout to the clipboard",
        group: "Dock",
        keywords: ["export", "json", "share"],
        run: () => actions.copyLayout(),
      },
      {
        id: "dock:paste-layout",
        label: "Paste a layout from the clipboard",
        group: "Dock",
        keywords: ["import", "json", "restore"],
        run: () => actions.pasteLayout(),
      },
    );
  }

  if (ctx.hasProject) {
    commands.push(
      {
        id: "create:task",
        label: "New task",
        group: "Panels",
        keywords: ["todo", "add"],
        run: () => actions.newTask(),
      },
      {
        id: "create:note",
        label: "New note",
        group: "Panels",
        keywords: ["write", "brain"],
        run: () => actions.newNote(),
      },
      {
        id: "create:today-note",
        label: "Open today's note",
        group: "Panels",
        keywords: ["daily", "journal"],
        run: () => actions.openDailyNote(),
      },
    );
  }

  for (const project of ctx.projects) {
    if (project.id === ctx.projectId) continue;
    commands.push({
      id: `project:${project.id}`,
      label: `Switch to ${project.name}`,
      group: "Project",
      keywords: ["workspace", "open"],
      run: () => actions.switchProject(project.id),
    });
  }

  commands.push({
    id: "theme:toggle",
    label: ctx.theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme",
    group: "Appearance",
    keywords: ["dark", "light", "mode"],
    run: () => actions.toggleTheme(),
  });

  commands.push({
    id: "data:reset",
    label: "Reset all data",
    group: "Data",
    keywords: ["wipe", "clear", "delete everything", "factory"],
    tone: "danger",
    confirm: {
      title: "Reset all data?",
      body: "Every project, note, task and activity row in this browser profile is deleted. This cannot be undone.",
      confirmLabel: "Delete everything",
    },
    run: () => actions.resetAllData(),
  });

  return commands;
}
```

**Create `src/lib/commands/filter.ts`:**

```ts
/**
 * Palette filtering: one pure function for commands, testable without cmdk.
 * Ranking: label prefix > label contains > keyword hit, then group order as
 * built (Panels, Dock, Tools, …) so the first row is stable.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { Command, CommandContext } from "./registry";

export type CommandMode = "all" | "go" | "dock";

/** True when a command may run in this context (kept for callers that build partially). */
export function isCommandAvailable(_command: Command, _ctx: CommandContext): boolean {
  return true;
}

function score(command: Command, query: string): number | null {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return 0;

  const label = command.label.toLowerCase();
  if (label.startsWith(needle)) return 0;
  if (label.includes(needle)) return 1;
  if (command.group.toLowerCase().includes(needle)) return 2;
  if (command.id.toLowerCase().includes(needle)) return 3;
  for (const keyword of command.keywords ?? []) {
    if (keyword.toLowerCase().includes(needle)) return 4;
  }
  return null;
}

const MODE_GROUPS: Record<CommandMode, string[] | null> = {
  all: null,
  go: ["Panels", "Project"],
  dock: ["Dock"],
};

export function filterCommands(
  commands: Command[],
  query: string,
  mode: CommandMode = "all",
): Command[] {
  const groups = MODE_GROUPS[mode];
  const inMode = groups ? commands.filter((c) => groups.includes(c.group)) : commands;

  const scored: { command: Command; rank: number; index: number }[] = [];
  inMode.forEach((command, index) => {
    const rank = score(command, query);
    if (rank === null) return;
    scored.push({ command, rank, index });
  });

  scored.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index));
  return scored.map((entry) => entry.command).slice(0, 40);
}
```

**Create `tests/unit/commands/filter.test.ts`** — move the `filterCommands` describe block from `registry.test.ts` into its own file (imports from `@/lib/commands/filter`), so it runs even if the registry changes shape. Both must pass.

Run: `pnpm test -- tests/unit/commands`
Expected: **PASS** — `Test Files 2 passed`, `Tests 12 passed`.

Commit: `feat(palette): pure command registry and filter (dock, tools, projects, destructive with confirm)`

---

## P8.T21 — Recent items (pure, TDD, ≈6 min)

**Create `tests/unit/stores/recent.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { pushRecent, type RecentItem } from "@/lib/stores/recent";

const item = (id: string, kind: RecentItem["kind"] = "page"): RecentItem => ({
  id,
  kind,
  label: id,
  href: id,
  at: 0,
});

describe("pushRecent", () => {
  it("puts the newest first", () => {
    const list = pushRecent(pushRecent([], item("/tasks")), item("/chat"));
    expect(list.map((i) => i.id)).toEqual(["/chat", "/tasks"]);
  });

  it("re-visiting an item moves it to the front instead of duplicating", () => {
    const list = pushRecent(pushRecent([], item("/tasks")), item("/chat"));
    expect(pushRecent(list, item("/tasks")).map((i) => i.id)).toEqual(["/tasks", "/chat"]);
  });

  it("keeps pages and entities in separate lanes", () => {
    const list = pushRecent(pushRecent([], item("/tasks")), item("n1", "entity"));
    expect(list.filter((i) => i.kind === "page")).toHaveLength(1);
    expect(list.filter((i) => i.kind === "entity")).toHaveLength(1);
  });

  it("caps the lane at 12 entries", () => {
    let list: RecentItem[] = [];
    for (let i = 0; i < 20; i += 1) list = pushRecent(list, item(`/p${i}`));
    expect(list).toHaveLength(12);
    expect(list[0].id).toBe("/p19");
  });

  it("stamps the visit time when given one", () => {
    expect(pushRecent([], item("/tasks"), 1234)[0].at).toBe(1234);
  });
});
```

Run: `pnpm test -- tests/unit/stores/recent.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/stores/recent"`.

**Create `src/lib/stores/recent.ts`:**

```ts
"use client";

/**
 * Recently used pages and entities, per project, for the palette's "Recent"
 * section. Two lanes (pages / entities) so opening five entities never pushes
 * the page you were on out of the list.
 *
 * Persisted (it is a preference, not a fact) and bounded (12 per lane).
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
// Reuse the existing non-DOM storage shim from the dock store (exported there).
import { memoryStorage } from "@/lib/stores/dock";

export interface RecentItem {
  /** Panel id / href for pages, entity id for entities. */
  id: string;
  kind: "page" | "entity";
  label: string;
  href: string;
  /** When it was last used (ms epoch). */
  at: number;
}

export const RECENT_LIMIT = 12;

/** Pure: push an item to the front of its lane, deduped, capped. */
export function pushRecent(
  list: RecentItem[],
  item: Omit<RecentItem, "at"> & { at?: number },
  at: number = Date.now(),
): RecentItem[] {
  const entry: RecentItem = { ...item, at: item.at ?? at };
  const lane = list.filter((existing) => existing.kind === entry.kind);
  const others = list.filter((existing) => existing.kind !== entry.kind);
  const next = [entry, ...lane.filter((existing) => existing.id !== entry.id)].slice(
    0,
    RECENT_LIMIT,
  );
  return [...next, ...others];
}

interface RecentStore {
  byProject: Record<string, RecentItem[]>;
  /** Record a page visit (panel id or route href). */
  rememberPage: (projectId: string, item: { id: string; label: string; href: string }) => void;
  /** Record an entity visit. */
  rememberEntity: (projectId: string, item: { id: string; label: string; href: string }) => void;
  /** The project's recents, newest first, pages in their own lane. */
  list: (projectId: string) => RecentItem[];
}

export const useRecentStore = create<RecentStore>()(
  persist(
    (set, get) => ({
      byProject: {},

      rememberPage: (projectId, item) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: pushRecent(s.byProject[projectId] ?? [], { ...item, kind: "page" }),
          },
        })),

      rememberEntity: (projectId, item) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: pushRecent(s.byProject[projectId] ?? [], { ...item, kind: "entity" }),
          },
        })),

      list: (projectId) => get().byProject[projectId] ?? [],
    }),
    {
      name: "masarflow-recent-v1",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : memoryStorage,
      ),
    },
  ),
);

```

Run: `pnpm test -- tests/unit/stores/recent.test.ts`
Expected: **PASS** — `Tests 5 passed`.

Commit: `feat(palette): per-project recent pages and entities (persisted, pure pushRecent)`

---

## P8.T22 — Palette v2: entities, commands, recents, a11y (pure TDD + UI, ≈15 min)

Design: keep the existing `CommandPalette` component and the shared `Dialog`; the palette becomes a thin renderer over `buildCommands` (T20), the P5 entity pipeline (`buildSearchItems` + `createSearchIndex`, exactly as `GlobalSearch` uses them), and `useRecentStore` (T21). `shouldFilter={false}` moves result selection into our pure code; mode chips replace cryptic prefixes; cmdk still owns ARIA; the Dialog keeps Escape; we add the focus trap it lacks.

**Create `tests/unit/ui/focus-trap.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { stepIndex } from "@/lib/ui/focus-trap";

describe("stepIndex", () => {
  it("wraps forward and backward", () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
  });

  it("handles a single focusable element", () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, 1, -1)).toBe(0);
  });

  it("handles an empty container", () => {
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });

  it("clamps an out-of-range current index", () => {
    expect(stepIndex(9, 3, 1)).toBe(1);
    expect(stepIndex(-2, 3, -1)).toBe(2);
  });
});
```

Run: `pnpm test -- tests/unit/ui/focus-trap.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/ui/focus-trap"`.

**Create `src/lib/ui/focus-trap.ts`:**

```ts
/**
 * Focus-trap math for modal overlays. The dialogs in this app already have
 * role="dialog", aria-modal, Escape and a body scroll lock (src/components/ui/
 * dialog.tsx); what they do NOT have is a focus trap, which is the one thing
 * that actually keeps a keyboard user inside an overlay. This module holds the
 * arithmetic; useFocusTrap (src/lib/hooks/use-focus-trap.ts) holds the DOM.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

/** Focusables inside a trap, in DOM order. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Index to move to when stepping `delta` (+1 Tab, -1 Shift+Tab) from `current`
 * within `count` focusables, wrapping at both ends. -1 when there is nothing
 * to focus (the caller must then prevent the default and keep focus where it is).
 */
export function stepIndex(current: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return -1;
  const from = current < 0 || current >= count ? (delta === 1 ? -1 : 0) : current;
  return (from + delta + count) % count;
}
```

Run: `pnpm test -- tests/unit/ui/focus-trap.test.ts`
Expected: **PASS** — `Tests 4 passed`.

**Create `src/lib/hooks/use-focus-trap.ts`:**

```ts
"use client";

/**
 * Focus trap + restore for overlays (the palette and the global search).
 * - on open: remembers document.activeElement and moves focus into the trap
 *   (the first focusable, unless the container already contains focus);
 * - Tab / Shift+Tab: wraps inside the container (stepIndex);
 * - on close: restores focus to what was focused before, so the keyboard user
 *   lands back where they were instead of at the top of the document.
 */

import { useEffect, type RefObject } from "react";
import { FOCUSABLE_SELECTOR, stepIndex } from "@/lib/ui/focus-trap";

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      );

    const first = focusables()[0];
    if (first && !container.contains(document.activeElement)) first.focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = stepIndex(current, items.length, e.shiftKey ? -1 : 1);
      e.preventDefault();
      items[next]?.focus();
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active, ref]);
}
```

**Rewrite `src/components/shell/command-palette.tsx`** as v2 (keep the file path and the store flags so nothing else changes):

```tsx
"use client";

/**
 * Command palette v2 — the single door into the app.
 *
 * What it searches (all provided by existing modules, never re-implemented):
 *   Commands  src/lib/commands/registry.ts (pure; this file injects the actions)
 *   Entities  buildSearchItems + createSearchIndex (the same index GlobalSearch uses, P5 hrefs)
 *   Recent    src/lib/stores/recent.ts (per-project lanes)
 *
 * Interaction rules: mode chips instead of magic prefixes (nothing cryptic),
 * destructive commands always route through ConfirmDialog, cmdk owns the ARIA
 * combobox/listbox semantics, the shared Dialog owns Escape, and
 * useFocusTrap supplies the focus containment that Dialog lacks.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Clock, ListChecks, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/lib/stores/ui";
import { useProjectStore } from "@/lib/stores/project";
import { useDockStore } from "@/lib/stores/dock";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { useFocusTrap } from "@/lib/hooks/use-focus-trap";
import { useRecentStore } from "@/lib/stores/recent";
import { buildCommands, type Command as Cmd, type CommandActions } from "@/lib/commands/registry";
import { filterCommands, type CommandMode } from "@/lib/commands/filter";
import { getDesktop } from "@/lib/desktop/bridge";
import { projectsRepo, notesRepo, tasksRepo, canvasRepo, specsRepo } from "@/lib/db/repos";
import { resetData } from "@/lib/db/data";
import { buildSearchItems, createSearchIndex, kindLabel, type SearchItem } from "@/lib/utils/search";
import { focusedPanelId } from "@/lib/dock/dock-core";
import { pageIdOf } from "@/lib/dock/types";
import { openDailyNote } from "@/lib/vault/daily";
import { pushToast } from "@/lib/stores/toast";

const MODES: { id: CommandMode; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "go", label: "Go to" },
  { id: "dock", label: "Dock" },
];

export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const trapRef = useRef<HTMLDivElement>(null);
  useFocusTrap(trapRef, open);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      position="top"
      showClose={false}
      className="overflow-hidden p-0"
      ariaLabel="Command palette"
    >
      <div ref={trapRef}>
        {open ? <PalettePanel onClose={() => setOpen(false)} /> : null}
      </div>
    </Dialog>
  );
}

function PalettePanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const projectId = useActiveProjectId();
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const dockEnabled = useUIStore((s) => s.dockEnabled);
  const setDockEnabled = useUIStore((s) => s.setDockEnabled);
  const desktop = useMemo(() => getDesktop(), []);
  const { theme, setTheme } = useTheme();
  const rememberPage = useRecentStore((s) => s.rememberPage);

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<CommandMode>("all");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [pending, setPending] = useState<Cmd | null>(null);

  const recents = useRecentStore((s) => (projectId ? s.byProject[projectId] ?? [] : []));

  useEffect(() => {
    void projectsRepo.all().then((rows) => setProjects(rows.map((p) => ({ id: p.id, name: p.name }))));
  }, []);

  useEffect(() => {
    let active = true;
    void buildSearchItems(projectId ?? undefined).then((result) => {
      if (active) setItems(result);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  function go(href: string): void {
    onClose();
    router.push(href);
  }

  function openPanel(panelId: string): void {
    onClose();
    useDockStore.getState().open(panelId);
  }

  function remember(label: string, href: string): void {
    if (!projectId) return;
    rememberPage(projectId, { id: href, label, href });
  }

  const actions: CommandActions = {
    navigate: go,
    openPanel,
    closeFocusedPanel: () => {
      const dock = useDockStore.getState();
      const state = dock.activeProjectId ? dock.projects[dock.activeProjectId] : null;
      if (state) dock.close(focusedPanelId(state));
    },
    floatFocusedPanel: () => {
      const dock = useDockStore.getState();
      const state = dock.activeProjectId ? dock.projects[dock.activeProjectId] : null;
      if (state) dock.float(focusedPanelId(state), { x: 160, y: 120 });
    },
    toggleMaximizeFocused: () => {
      const dock = useDockStore.getState();
      const state = dock.activeProjectId ? dock.projects[dock.activeProjectId] : null;
      if (state) dock.toggleMaximize(pageIdOf(focusedPanelId(state)));
    },
    resetWorkspace: () => useDockStore.getState().resetWorkspace(),
    copyLayout: () => {
      const json = useDockStore.getState().exportLayout();
      if (!json) return;
      void navigator.clipboard.writeText(json);
      pushToast({ title: "Layout copied", tone: "success" });
    },
    pasteLayout: () => {
      void navigator.clipboard.readText().then((text) => {
        const installed = useDockStore.getState().importLayout(text);
        if (!installed) {
          pushToast({ title: "That is not a MasarFlow layout file", tone: "danger" });
        }
      });
    },
    toggleTheme: () => setTheme(theme === "light" ? "dark" : "light"),
    switchProject: (id) => {
      setActiveProjectId(id);
      const project = projects.find((p) => p.id === id);
      pushToast({ title: `Switched to ${project?.name ?? "project"}` });
    },
    newTask: () => {
      if (!projectId) return;
      void tasksRepo.create({ projectId, title: "Untitled task" }).then(() => go("/tasks"));
    },
    newNote: () => {
      if (!projectId) return;
      void notesRepo.create({ projectId, title: "Untitled note" }).then((note) => go(`/brain?note=${note.id}`));
    },
    openDailyNote: () => {
      if (!projectId) return;
      void openDailyNote(projectId).then(() => onClose());
    },
    openLogsFolder: () => void desktop?.app.openLogs(),
    resetAllData: () => {
      void resetData().then(() => {
        setActiveProjectId(null);
        go("/dashboard");
      });
    },
    isEntityOpen: () => false,
  };

  const commands = useMemo(
    () =>
      buildCommands(
        {
          dockEnabled,
          hasProject: Boolean(projectId),
          projectId,
          theme: theme === "light" ? "light" : "dark",
          projects,
          desktopAvailable: Boolean(desktop),
        },
        actions,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dockEnabled, projectId, projects, theme, desktop, items.length],
  );

  const visibleCommands = useMemo(() => filterCommands(commands, query, mode), [commands, query, mode]);

  const fuse = useMemo(() => createSearchIndex(items), [items]);
  const entityHits = useMemo(() => {
    if (query.trim().length < 2 || mode === "dock") return [];
    return fuse
      .search(query)
      .slice(0, 12)
      .map((hit) => hit.item);
  }, [fuse, query, mode]);

  const results = entityHits.slice(0, 6);

  function runCommand(command: Cmd): void {
    if (command.confirm) {
      setPending(command);
      return;
    }
    onClose();
    void command.run();
  }

  return (
    <>
      <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Type a command, a page, a task, a note…"
          aria-label="Search commands, pages and items"
          autoFocus
        />

        {/* Mode chips: discoverable modes beat magic prefixes. */}
        <div role="group" aria-label="What to search" className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={mode === entry.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMode(entry.id)}
              className={
                mode === entry.id
                  ? "rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-foreground"
                  : "rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50"
              }
            >
              {entry.label}
            </button>
          ))}
          <span className="ml-auto pr-1 text-[11px] text-muted-foreground">
            {projectId ? "Searches this project" : "No project open"}
          </span>
        </div>

        <CommandList>
          <CommandEmpty>
            {items.length === 0
              ? "Nothing to search yet — create a note, a task or a specification."
              : `No match for “${query}”. Try fewer words, or another chip above.`}
          </CommandEmpty>

          {query.trim().length === 0 && recents.length > 0 ? (
            <CommandGroup heading="Recent">
              {recents.slice(0, 5).map((recent) => (
                <CommandItem
                  key={`recent-${recent.kind}-${recent.id}`}
                  value={`recent-${recent.kind}-${recent.id}`}
                  onSelect={() => go(recent.href)}
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{recent.label}</span>
                  <span className="text-[11px] text-muted-foreground">Recent</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {results.length > 0 ? (
            <CommandGroup heading="Items">
              {results.map((item) => (
                <CommandItem key={`entity-${item.id}`} value={`entity-${item.id}`} onSelect={() => go(item.href)}>
                  <Badge variant="outline" className="shrink-0">
                    {kindLabel(item.kind)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.subtitle ? (
                    <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {visibleCommands.length > 0 ? (
            <CommandGroup heading={mode === "all" ? "Commands" : MODES.find((m) => m.id === mode)?.label ?? "Commands"}>
              {visibleCommands.map((command) => (
                <CommandItem
                  key={command.id}
                  value={command.id}
                  onSelect={() => runCommand(command)}
                  className={command.tone === "danger" ? "text-destructive" : undefined}
                >
                  <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint ? <span className="text-[11px] text-muted-foreground">{command.hint}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>

      {/* Dock toggle + a first-run hint live outside the list so they are always reachable. */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Search className="h-3 w-3" /> Type to filter · chips narrow it down · Esc closes
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDockEnabled(!dockEnabled)}
          className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
        >
          {dockEnabled ? "Dock: on — click to use full pages" : "Dock: off — click to use panels"}
        </button>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={pending?.confirm?.title ?? ""}
        description={pending?.confirm?.body ?? ""}
        confirmLabel={pending?.confirm?.confirmLabel ?? "Confirm"}
        destructive
        onConfirm={() => {
          const command = pending;
          setPending(null);
          onClose();
          void command?.run();
        }}
      />
    </>
  );
}
```

`ConfirmDialog`'s real props are `{open, onOpenChange, title, description, confirmLabel, destructive, onConfirm}` (src/components/ui/confirm-dialog.tsx:7-15) — the snippet above matches them exactly; it defaults `confirmLabel` to "Delete" and `destructive` to true, and the snippet passes both explicitly. `CommandInput` forwards unknown props to cmdk's `Input`, which supports `value`/`onValueChange` (the existing palette relies on cmdk filtering, so `shouldFilter={false}` is the one behavioural change to watch in review).

Also record page visits so the Recent section fills up: in `src/lib/hooks/use-dock-sync.ts`, after the URL→dock sync succeeds, call `useRecentStore.getState().rememberPage(projectId, { id: path, label: path, href: path })`, and in `openEntity` (P5, `src/lib/entities/open.ts`) add the entity visit — if P5's module is frozen, do the page half only and note it in the commit message.

**Manual verification (4 min, exact):**
1. `pnpm dev` → `⌘/Ctrl+K`. The modal shows chips *Everything / Go to / Dock* and the hint line *Type to filter · chips narrow it down · Esc closes*.
2. Type `terminal` → *Open Terminal* appears under Tools (desktop) or is absent in the browser (desktop-only commands are hidden, not greyed — nothing fake).
3. Type `float` → *Float the focused panel* with the `Alt+F` hint; Enter floats the focused panel.
4. Press `Tab` repeatedly: focus stays inside the palette (it wraps: after the last chip/row it returns to the search input). Press `Esc` → the palette closes and focus returns to the element that was focused before opening (the topbar button or the page).
5. Delete a letter and type `auth` (with any note/task titled that) → an *Items* group appears with kind badges; Enter opens it in its dock panel.
6. Open a few pages, reopen the palette with an empty query → *Recent* shows them newest first, 5 at most.
7. Switch the chip to *Dock* → only dock commands; switch to *Go to* → only pages/projects.
8. Highlight *Reset all data* → Enter asks *Reset all data?* with the *Delete everything* button; Escape or Cancel closes the confirmation and **does not** wipe data.
9. `Alt` + the row's hint (`Alt+W`) still closes panels while the palette is closed.

Commit: `feat(palette): v2 — commands, entities, recents, mode chips, focus trap and confirmation`

---

## P8.T23 — Narrow windows: compact mode, honest chrome (pure TDD + UI, ≈10 min)

The user's daily machine is a ~1366 px laptop; the dock's splits, sidebar and floating dock must degrade predictably there instead of squeezing panels to illegible widths.

**Create `tests/unit/ui/viewport.test.ts` (failing):**

```ts
import { describe, expect, it } from "vitest";
import { COMPACT_MAX, WIDE_MIN, viewportMode } from "@/lib/ui/viewport";

describe("viewportMode", () => {
  it("classifies the three widths the dock cares about", () => {
    expect(viewportMode(900)).toBe("compact");
    expect(viewportMode(1280)).toBe("regular");
    expect(viewportMode(1920)).toBe("wide");
  });

  it("uses inclusive lower bounds", () => {
    expect(viewportMode(COMPACT_MAX)).toBe("compact");
    expect(viewportMode(COMPACT_MAX + 1)).toBe("regular");
    expect(viewportMode(WIDE_MIN)).toBe("wide");
  });

  it("never reports a mode for a nonsense width", () => {
    expect(viewportMode(0)).toBe("compact");
    expect(viewportMode(-100)).toBe("compact");
  });
});
```

Run: `pnpm test -- tests/unit/ui/viewport.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/ui/viewport"`.

**Create `src/lib/ui/viewport.ts`:**

```ts
/**
 * Window-width classes for layout decisions. Three modes only, so behaviour is
 * predictable and testable:
 *   compact  (< 1024)  one panel at a time; the sidebar collapses to icons; the
 *                      dock's split layout is presented as a panel switcher
 *   regular  (1024+)   normal dock behaviour (a 1366 px laptop lands here)
 *   wide     (1680+)   room for 3 columns and floating windows by default
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

export type ViewportMode = "compact" | "regular" | "wide";

export const COMPACT_MAX = 1023;
export const WIDE_MIN = 1680;

export function viewportMode(width: number): ViewportMode {
  if (width <= COMPACT_MAX) return "compact";
  if (width >= WIDE_MIN) return "wide";
  return "regular";
}
```

Run: `pnpm test -- tests/unit/ui/viewport.test.ts`
Expected: **PASS** — `Tests 3 passed`.

**Create `src/lib/hooks/use-narrow-viewport.ts`:**

```ts
"use client";

/**
 * The current viewport mode, updated on resize. Reads window.innerWidth (the
 * browser's real width, not a container), which is what the layout decisions
 * in T23 depend on.
 */

import { useEffect, useState } from "react";
import { viewportMode, type ViewportMode } from "@/lib/ui/viewport";

export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(() =>
    typeof window === "undefined" ? "regular" : viewportMode(window.innerWidth),
  );

  useEffect(() => {
    const update = (): void => setMode(viewportMode(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return mode;
}
```

**Wire it (three edits):**

1. `src/components/dock/dock-workspace.tsx` — in compact mode render one panel at a time with an explicit switcher instead of the split tree:
```tsx
  const mode = useViewportMode();
  const [compactPanel, setCompactPanel] = useState<string | null>(null);
```
```tsx
      {mode === "compact" ? (
        <div className="flex h-full min-h-0 flex-col">
          <div role="tablist" aria-label="Open panels" className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-1.5">
            {collectPages(tree).map((panelId) => (
              <button
                key={panelId}
                type="button"
                role="tab"
                aria-selected={(compactPanel ?? firstPanel) === panelId}
                onClick={() => setCompactPanel(panelId)}
                className={
                  (compactPanel ?? firstPanel) === panelId
                    ? "h-7 shrink-0 rounded-md bg-accent px-2 text-xs font-medium"
                    : "h-7 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent/50"
                }
              >
                {getPageDef(panelId)?.label ?? pageIdOf(panelId)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <PanelContent active>
              {(() => {
                const Active = PAGE_COMPONENTS[pageIdOf(compactPanel ?? firstPanel ?? "")] ?? null;
                return Active ? (
                  <PanelErrorBoundary panelId={compactPanel ?? firstPanel ?? ""}>
                    <Active />
                  </PanelErrorBoundary>
                ) : (
                  <PanelMissing panelId={compactPanel ?? firstPanel ?? ""} />
                );
              })()}
            </PanelContent>
          </div>
        </div>
      ) : (
        /* existing tree + maximized + floaters + tray + overlay, unchanged */
      )}
```
with `const firstPanel = collectPages(tree)[0] ?? null;` and imports for `collectPages` (`@/lib/dock/tree`), `getPageDef`, `PAGE_COMPONENTS`, `PanelErrorBoundary`/`PanelMissing`, `useViewportMode`.
**Document the trade-off in the code comment**: in compact mode the split layout is *preserved in state* but not rendered, so widening the window restores it exactly; floating windows are hidden in compact mode (they would overlap a single column) and reappear on widening — say this in the comment and do not "fix" it by destroying floaters.

2. `src/components/shell/sidebar.tsx` — auto-collapse in compact mode, once per crossing:
```tsx
  // sidebar.tsx already selects activeNavGroup/toggleSidebar/taskbarDirection
  // from useUIStore (lines 308-312); add the setter and the mode:
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const mode = useViewportMode();
  useEffect(() => {
    if (mode === "compact") setSidebarCollapsed(true);
  }, [mode, setSidebarCollapsed]);
```
(Add `useEffect` to the existing `react` import if it is not already there. The user can still expand the sidebar manually; this only fires on the transition.)

3. `src/components/shell/topbar.tsx` — a desktop indicator (self-explanatory UI: the user must know which build they are in). Extend its existing `react` import (topbar.tsx:3 imports `useState`) with `useEffect` and `useMemo`, and place the chip beside the `WorkspaceMenu` block:
```tsx
  const desktop = useMemo(() => getDesktop(), []);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!desktop) return;
    void desktop.app.info().then((info) => setAppVersion(info.displayVersion));
  }, [desktop]);
```
```tsx
        {desktop ? (
          <span
            title={`MasarFlow desktop app ${appVersion ?? ""} — commands run on this computer`}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground sm:flex"
          >
            <AppWindow className="h-3 w-3" />
            Desktop {appVersion ?? ""}
          </span>
        ) : null}
```
(`AppWindow` is a lucide icon; if `rg -n "declare const AppWindow" node_modules/lucide-react/dist/lucide-react.d.ts` finds nothing, use `MonitorSmartphone` or `Monitor` — pick one that resolves.)

**Manual verification (2 min, exact):**
1. `pnpm dev`, then resize the browser window to ~1280 px wide (a 1366 px laptop): the sidebar stays expanded, the dock keeps its splits, no horizontal scrollbar appears.
2. Drag the window narrower than 1024 px: the sidebar collapses to the icon rail, and the dock shows a single panel with a horizontal **panel switcher** strip listing every open panel (labels from the nav). Clicking a label switches the visible panel; nothing is lost.
3. Widen back above 1024 px: the split layout returns exactly as it was (same ratios, same tabs) and any floating windows reappear.
4. In the desktop app, the topbar shows *Desktop 0.2.0* (or the packaged version) with a tooltip that says commands run on this computer.

Commit: `feat(shell): compact layout for narrow windows, desktop indicator, predictable degradation`

---

## P8.T24 — The quality budget P9 will enforce (doc + one guard test, ≈6 min)

**Create `docs/ui-budget.md`:**

```markdown
# UI budget (MasarFlow desktop app)

Numbers, not adjectives. P9 measures these; P8 must not regress them.

## Interaction latency (measured in the packaged app, median of 10 runs)
| Interaction | Budget | How P9 measures |
|---|---|---|
| Open a dock panel (already mounted) | < 50 ms | `performance.now()` around the tab click in Playwright, assert the panel's `data-testid="panel-active"` is visible |
| Switch a tab in a group | < 50 ms | same, between two tabs |
| Open the command palette (⌘/Ctrl+K) until the input is focused | < 150 ms | Playwright: keypress → `document.activeElement` is the palette input |
| Focus movement (Alt+Shift+→) | < 60 ms | Playwright: keypress → the neighbour tab has `aria-selected="true"` |
| Split resize drag (60 frames) | no frame > 32 ms | `requestAnimationFrame` deltas collected in the page, assert p95 < 32 ms |
| Streamed chat first token | < 800 ms (unchanged from P5) | P5's existing Playwright spec |

## Keyboard reachability (assert once per route)
- Every panel header control (close, actions menu, all-tabs menu) is reachable with Tab and operable with Enter/Space.
- The tab strip follows the WAI-ARIA tabs pattern: ArrowLeft/ArrowRight/Home/End move, Delete closes.
- Split dividers are focusable and resizable with arrows; `aria-valuenow` changes.
- The palette traps focus and restores it to the previously focused element on close.
- No keyboard trap anywhere else: `Escape` always closes the top overlay.

## Accessibility (axe-core via `@axe-core/playwright`, P9 adds the dep)
- Zero `critical`/`serious` violations on `/today`, `/dashboard`, `/tools/logs`, `/tools/system`, and the palette open.
- Every icon-only button has an `aria-label` (checked at review time; P9's axe run catches regressions).
- Colour is never the only signal: overdue rows carry the word "Overdue", errors carry the word "error".

## Copy rules (formal, self-explanatory — the house style)
- No unexplained symbols or abbreviations in UI copy; every control names its effect.
- Destructive actions state the consequence and offer undo or a confirmation — never both a silent wipe and a "success" toast.
- Empty states say what to do next ("Link a folder in Chat → Linked folders"), never just "No data".
- Panel errors name the panel and offer exactly one recovery action ("Reload panel").

## What will NOT be measured
- Bundle size per route (the desktop app loads from localhost; the P10 perf pass owns this).
- Availability with no linked folder (the terminal/logs panels are desktop-only by design and must *say so*, not degrade silently).
```

**Create `tests/unit/ui/no-native-dialogs.test.ts` (passes today; it locks the rule in):**

```ts
import { describe, expect, it } from "vitest";
import { readSources } from "../_helpers/fs-scan";

/**
 * The app must never use window.alert/confirm/prompt: they are unstyled, block
 * the renderer (which owns the dock's pointer capture), cannot be themed, and
 * give the user no place to explain a consequence. Use ConfirmDialog for
 * decisions and the toast store for outcomes.
 */
describe("no native dialogs", () => {
  it("has no alert/confirm/prompt calls in application source", () => {
    const offenders = readSources()
      .filter((source) => source.path.startsWith("src/"))
      .filter((source) => /\b(window\.)?(alert|confirm|prompt)\s*\(/.test(source.text))
      .map((source) => source.path);
    expect(offenders).toEqual([]);
  });

  it("routes destructive commands through ConfirmDialog", () => {
    const registry = readSources().find((s) => s.path === "src/lib/commands/registry.ts")?.text ?? "";
    const dangerous = registry.match(/tone: "danger"/g)?.length ?? 0;
    const confirmations = registry.match(/confirm: \{/g)?.length ?? 0;
    expect(dangerous).toBeGreaterThan(0);
    expect(confirmations).toBe(dangerous);
  });
});
```

Run: `pnpm test -- tests/unit/ui/no-native-dialogs.test.ts`
Expected: **PASS** — `Tests 2 passed`. If the first test fails, the reported path is a real violation: replace it with a `ConfirmDialog` (decisions) or a toast (outcomes) in the file that owns it.

Commit: `docs: UI budget for P9 (latency, keyboard, a11y, copy) + no-native-dialogs guard`

---

## P8.T25 — Gate (≈5 min)

The Playwright feature titles that belong to this phase are listed under **Handoffs** below and are appended to `tests/e2e/feature-matrix.json` **in P9**, not here (adding a feature early turns P0's guard red — same rule as P5.T15).

1. Confirm this plan still carries the handoff list (the master's §10 only cross-references it): `grep -c "Playwright suite" .hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p8-dock-frontend.md` → `1`. Match on words, not on the `→` arrow: MSYS `grep` answered `0` for a `P8 → P9` pattern while the bytes are present (verified while writing this plan) — a gate command that lies is worse than no gate.
2. **P8 gate** — all must pass:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm desktop:typecheck
pnpm build
```

Expected: all tests pass — the P0 baseline plus roughly 130 new P8 tests (the exact number is whatever `pnpm test` prints; the gate is zero failures); `typecheck` clean; `lint` 0 errors (pre-existing warnings only); `desktop:typecheck` clean; `next build` succeeds with the four new routes in the route table (`/today`, `/tools/terminal`, `/tools/logs`, `/tools/system`) — the 22 existing routes must still build.
3. **Manual acceptance, 5 minutes, in `pnpm desktop:dev`:** open the app on `masarflow://app/dashboard`, then in one pass —
   a. palette → *Open Today* → the Today view renders with buckets, the activity feed, the repository card and the *Open today's note* button (P7's `openDailyNote`): first press creates the note, every press focuses it, and a second press never creates a second note;
   b. palette → *Open Terminal* → start a shell in the linked folder, run `echo ok`, `Ctrl+C` copy a selection, reload the window and confirm the session re-attaches;
   c. palette → *Open Logs* → the tail of `main.log` renders, *Errors only* filters it;
   d. palette → *Open System Info* → version, data folder, allowed folder with a green check, table counts;
   e. drag *Logs* onto the right half of *Today* → the split lands, no toast about a lost panel; `Alt+M` maximizes, `Alt+M` restores; `Alt+F` floats and the floater docks back onto a tab strip;
   f. close the Terminal panel → undo from the toast → it comes back; *Reset this workspace* → undo → the previous layout returns (params included);
   g. resize the window below 1024 px → compact switcher appears; widen → the split layout returns unchanged;
   h. quit and relaunch the app → the layout, the workspace name and the open panels are exactly as they were (this is the migration path in real conditions: the app writes v2 from now on, and a v1 payload from the previous build loads without losing the layout).
4. No commit for the gate itself.

---

## Risks & open questions for P8

- **R-P8-1 Version-2 payload churn.** T1 makes `ProjectDockState.version` a compile-visible literal, so any *other* phase that constructs a state literal must use `2` (P8 updated `presets.ts` and two test fixtures). If P9/P10 add fields, they must bump to `3` and add a `migrate` step — the pattern is now established and tested.
- **R-P8-2 The terminal is not sandboxed once it runs.** The main process only decides *where* the shell starts; after that the user's own shell can `cd` anywhere, exactly like a normal terminal. That is why the panel prints the warning sentence above the surface (T13) and why master D3's root rule is about the *agent*, not about pretending a user's shell is a jail. If a future phase wants a true sandbox, that is a new decision with its own plan.
- **R-P8-3 `@desktop/logs` and `@desktop-shared/terminal` depend on P1.T1's vitest aliases.** If those aliases are missing, the two suites fail to resolve instead of failing assertions — check `tests/vitest.config.ts` before debugging the tests themselves.
- **R-P8-4 Unsaved drafts remain unsaved.** T10 documents why there is no conflict UI: panels can't duplicate a path, pages read through Dexie live queries, and the only lossy path is an unsaved draft in a keep-alive panel being overwritten by a fresher record. Mitigations today: editors save on blur, P5's activity feed shows the change. A draft-protection feature (per-panel dirty registry + "this changed elsewhere" banner) is deliberately out of scope for 0.2.
- **R-P8-5 Log rotation does not exist.** The Logs panel tails whatever files are in the log directory; nothing truncates them. If the Next server's log grows past a few MB over months, the panel still only reads the last 512 KB (T14 caps it) but the file keeps growing — P10's Control Center should own rotation, and the panel should stay read-only until then.
- **R-P8-6 Compact mode hides floaters.** Below 1024 px the dock renders one panel at a time and floating windows are hidden (their state is preserved). This is honest degradation, but a user with a floater open and a small window will not see it — the compact switcher lists tree panels only. If that surprises in daily use, the fix is one line (extend the switcher with floater panels), not a redesign.
- **Q-P8-1** Should `Alt+W` (close) also work over a floating window (closing the floater rather than the focused tree panel)? *Default: no — a floater is the window the user deliberately moved away; `Alt+W` acts on the focused tree panel, and floaters have their own ✕. Revisit only if daily use disagrees.*
- **Q-P8-2** Should the Today view be the boot page instead of `/dashboard`? *Default: no for 0.2 — `/dashboard` is the placeholder page id (`tree.ts:19`) and the P1 smoke target; switching the landing page is a product decision for the release owner, and the change is one line in `PLACEHOLDER_PAGE_ID` plus the P1 smoke assertion.*
- **Q-P8-3** Should the palette's entity results be ranked by recency (P5 activity) as well as Fuse score? *Default: no — Fuse relevance first, recency only for the empty-query Recent list, because users type the name they want.*

---

## Handoffs

**P8 → P9 (Playwright suite).** Append these feature titles to `tests/e2e/feature-matrix.json` **in P9** (P8 does not touch that file: P0's guard fails any listed feature without a matching spec titled `"<route>: <feature>"`). Each title is one spec:

1. `"/today: TODAY view groups overdue, due today, in progress and up next from the local database"`
2. `"/today: TODAY opens (creating once) the daily note and focuses it in the dock"`
3. `"/tools/terminal: TERMINAL starts a shell in a linked folder, runs a command and re-attaches after a reload"`
4. `"/tools/terminal: TERMINAL refuses a folder that is not registered and says why"`
5. `"/tools/logs: LOGS lists log files, tails one and filters to errors only"`
6. `"/tools/system: SYSTEM reports version, allowed folders and table counts read-only"`
7. `"dock: DOCK nests, tabs, floats and restores a panel and survives a reload (persisted layout)"`
8. `"dock: DOCK refuses a self-drop, cancels on Escape and keeps every panel in the layout"`
9. `"dock: DOCK tab strip is keyboard-operable (arrows, Home/End, Delete) and shows the all-tabs menu"`
10. `"dock: DOCK split dividers resize with the keyboard and expose aria-valuenow"`
11. `"dock: DOCK close is undoable from the toast and Reset workspace is undoable"`
12. `"dock: DOCK workspace duplicate, delete (with undo) and copy/paste layout round-trip"`
13. `"dock: DOCK migrations — a v1 persisted payload loads as v2 instead of resetting the layout"`
14. `"/dashboard: PALETTE v2 searches commands, items and recents, traps focus and confirms destructive commands"`
15. `"/dashboard: PALETTE v2 switches project and floats/maximizes/closes the focused panel"`
16. `"/settings: SHELL degrades to the compact panel switcher below 1024 px and restores the split layout when widened"`
17. `"/dashboard: SHELL panel crash is isolated — the dock keeps working and offers Reload panel"`

**P8 → P10 (Control Center / Settings).**
- P10 owns the **editable** environment surface (API keys, providers, `.env` values) that `src/components/tools/system-panel.tsx` deliberately does not touch; the panel says so in its own copy, so P10 should replace/beside it rather than duplicate it.
- P10 owns **log rotation and log deletion** (R-P8-5). The panel keeps only "Open logs folder" until then.
- P10's "Copy diagnostics" should reuse the report built in `system-panel.tsx` (extract it to `src/lib/tools/system.ts` if a second caller appears — do not copy the string).

**P8 → P7 (vault / daily notes).** P8 consumes P7's `openDailyNote(projectId, date?)` from `src/lib/vault/daily.ts` verbatim (T18, a single call site) and owns no daily-note logic: the title convention (`YYYY-MM-DD`, local time), the `daily` tag, the `day` property and the `daily/<YYYY-MM-DD>.md` mirror path are all P7's. If P7 later adds a `daily` note **type**, nothing in P8 changes — the button only calls the function. P7's own feature title (`/brain: daily note opens from the Today view`, P7 plan item 8) is the end-to-end check; T18's manual step 3 is the local one.

**P8 → P6 (git).** T19 consumes exactly `useGitRepo()` from `src/lib/git/use-git-repo.ts` and reads `{ root, loading, error, status }` off it, where `status: GitRepoStatus | null` is the `@shared/git` DTO (`{ head, detached, oid, upstream, ahead, behind, staged[], unstaged[], untracked[], conflicted[] }`). P8 ships no git code of its own. If P6 renames the hook or moves it, change the single import in `src/components/today/today-git.tsx`; P9's `/today` spec must cover the card's four states (reading, no repository, read failure, status) so a rename can never silently degrade the card to "no repository".
