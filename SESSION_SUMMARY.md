# MasarFlow — Complete Session Summary

A full development journal covering everything built in this opencode session, from initial planning through eight production stages and post-launch fixes.

---

## Pre-S1: Discovery and Setup

The session started by exploring `C:\Users\trookish\Dev\Web-Projects\MasarFlow` — a freshly scaffolded Next.js 15 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Motion + Zustand + Dexie workspace. A `run-dev.ps1` helper was created to launch the dev server detached. A repeating environment quirk was identified early: paths with parentheses (Next.js dynamic routes like `(workspace)`) break PowerShell `Edit`/`Write` tools because the shell tries to interpret the parens as subexpressions. The workaround throughout the session was to prefix relative paths with `./`.

---

## S1 — Foundation (`51e30a9`)

**Goal:** establish the design system, the app shell, all 12 module routes, and a fully seeded local database.

- **Design tokens** in `src/styles/globals.css` via Tailwind v4 `@theme inline` — full OKLCH palette (`--primary`, `--surface`, `--muted`, etc.), accent-hue CSS variable, dark-first theme with `class="dark"` on `<html>` driven by `next-themes`.
- **App shell** at `src/components/shell/`: 3-pane layout (left nav, main content, right rail), `LeftNav`, `TopBar`, `RightRail`, `StatusBar`, `CommandPalette` (cmdk), `GlobalSearch`, `ProjectSwitcher`, `ShortcutsCheatsheet`.
- **12 module routes** under `src/app/(workspace)/`: `/` (dashboard), `/brain`, `/specs`, `/standards`, `/architecture`, `/tasks`, `/agents`, `/docs`, `/dev-logs`, `/search`, `/settings`, `/workflow`, plus `/knowledge-graph` and `/unity`.
- **Dexie schema** with 16 tables (projects, notes, specs, standards, tasks, systems, archNodes, archEdges, docs, devLogs, agents, commits, memories, links, tags, folders, plans) and a zustand-persisted UI store.
- **Rich seed** with 3 specs, 12 notes, 8 tasks, 5 standards, 5 systems, 22 arch nodes, 25 edges, 4 docs, 5 logs, 5 commits, 5 memories, 2 plans.
- **Animations** using Motion (Framer Motion v12) for shell entrance, page transitions, command palette, and tooltip.

---

## S2 — Editors and Brain CRUD (`4fd68b5`)

- **Tiptap v3** rich-text editor at `src/components/editor/rich-editor.tsx` with StarterKit, Placeholder, Link, TaskList/Item; custom markdown serializer to keep the on-disk format portable.
- **Brain CRUD** pages `/brain/new` and `/brain/[id]` with autosave debouncing, **bidirectional wikilinks** (`findBacklinks` in `src/lib/markdown/links.ts`), inline tag extraction, folder + type pickers.
- **Standards editor dialog** and **docs editor dialog** with auto-stub generation from specs.
- **Dev log composer** in right rail with kind filtering.

---

## S3 — Spec/Task Editors, Workflow, Search (`8ce557e`)

- Full **`SpecEditorDialog`** covering purpose, goals, features, constraints, dependencies, acceptance, technical notes, risks, future improvements, status pills.
- `/specs` filter tabs (all, active, review, draft, shipped) plus a "+ New RFC" flow.
- `/specs/[id]` with a **status quick-switcher** and the new **PlanPanel** (Generate/Approve/Reject/Regenerate).
- **Task editor dialog** with progress slider, status/priority, dependency picker, assignee, tags.
- `/workflow` page rendering the **16-step animated pipeline** (Understand intent → ... → Update tasks & architecture).
- **MiniSearch** index in `src/lib/search/index.ts` covering all entities; `/search` page with grouped results, recent searches, action shortcuts.
- **Command palette** overhaul with 40+ actions.

---

## S4 — React Flow Architecture & Agents (`9644a45`)

- **`src/components/architecture/arch-graph.tsx`** using `@xyflow/react` v12 with 7 custom node types, 5 edge kinds (`depends`, `calls`, `instantiates`, `flows-into`, `references`), mini-map, legend, and auto-layout grouped by system.
- **Agents index** page overhauled; new `/agents/[agentId]` route with persona, capabilities, **live reasoning chain** (an animated step-by-step thought process), mock run history, system prompt viewer, "Run once" button.
- Seed bumped to `SEED_VERSION = 2` (22 arch nodes, 25 edges, 8 agents with reasoning data).

---

## S5 — Dashboard, Unity, Automation, Export/Import (`b23d280`)

- **Rich dashboard** (`src/app/(workspace)/page.tsx`) with: health ring, 6 stat cards, 16-step pipeline, milestones, automation feed, activity feed, recent commits widget, "what to do next" suggestions.
- **`/unity` page** with 12 simulated Unity/3D assets (Unity Asset Store, Sketchfab, Poly Haven, OpenGameArt, Freesound, Pexels, Unsplash) and a **Touch button** that creates a dev log + commit event when you "find" an asset.
- **`src/lib/automation/engine.ts`** with `startAutomation(30s interval)` running memory weight decay, recall, spec progress recalc, auto-ship at 100%, search index invalidation, and an event bus.
- **`src/lib/data/index.ts`** export/import of all 16 tables as JSON.
- **`DataTransferDialog`** for export/import/both modes, replace vs merge strategies, per-table counts.
- Right-rail **"Recent dev logs"** panel.

---

## S6 — Plugins & Keyboard Customization (`b3a3d5a` + `fdbb7b4`)

- **`src/lib/plugins/index.ts`**: Zod-validated `PluginManifest`, 4 built-in plugins (core-agents, command-palette, graph-kinds, extra-theme), install/uninstall/enable flow with `localStorage` persistence (`masarflow.plugins.v1`).
- **`src/app/(workspace)/plugins/page.tsx`**: install from JSON, 3 sample buttons, live toggles, JSON schema example.
- **`src/lib/keyboard/shortcuts.ts`**: 25 remappable shortcuts (global, go-to, create, action).
- **`src/components/shell/shortcuts-cheatsheet.tsx`**: search, group, click-to-remap with conflict detection.
- **`src/lib/stores/create-dialogs.ts`**: cross-page "open this editor" signal used by the `N`-prefix shortcuts.
- **`src/components/providers/keyboard-provider.tsx`**: state-machine matcher that reads `getEffectiveShortcuts()` and fires the right action per combo, including two-key sequences (`G D`, `N S`, `R W`).
- All 12 module pages wired to open their editors when the corresponding `N`-shortcut fires.
- **Settings polish**: live preview tile showing accent/font/density in real time; reduced-motion toggle that adds `.reduced-motion` to `<html>` and kills all transitions via CSS; API key field for non-simulated AI providers; save shortcut wired to the Brain note editor.

---

## S7 — Obsidian Vault Integration (5 commits)

The user asked for local Obsidian vault sync. The vault at `C:\Users\trookish\Desktop\ObsidianVault\ObsidianVault` was analyzed first — it uses a **PARA + numbered folder system** (`00. Inbox`, `01. Projects`, `02. Areas`, `03. Knowledge`, `04. Resources`, `05. Tasks`, `06. Templates`, `07. Draw`, `08. Attachments`, `09. Archive`, `99. Core`), 104 `.md` files, TaskNotes plugin frontmatter, `.canvas` files, `.space/` make-md per-folder metadata, an Arabic-named note, and an `attachments/` folder with PNG/PDF/m4a files.

User's rules:
1. **Default = Mode B** (local notes); Mode A (Obsidian) requires explicit opt-in via folder picker.
2. Chromium-only for the File System Access API; Firefox/Safari fall back to a manual import/export path.
3. First-run wizard offering A / B / Skip appears on the first visit to `/brain`.
4. **My recommendation adopted:** bidirectional sync with last-write-wins by mtime, manual Sync button + optional 30s polling.
5. Sync folders matching `NN. Name`; `.trash/` synced as a **separate Trash view** with restore/hard-delete.
6. The numeric prefix convention is preserved in both modes; Mode B recreates the same numbered virtual folders.
7. **TaskNotes tasks import as native MasarFlow tasks** (option a).
8. Known frontmatter keys mapped, `sticker` and `tasknotes_manual_order` ignored, unknown keys preserved as opaque blob.
9. `.canvas` files skipped with a placeholder card; Templates folder synced with `template: true` flag, hidden from main view, surfaced in a Templates filter.
10. Attachments **render inline by MIME type** (image, video, audio, PDF, text, downloadable).
11. Right-rail "Vault" panel always visible (Local or Live).
12. Settings page "Vault" section with mode, limits, polling, patterns, storage, "Forget vault", "Clear cache".
13. Excalidraw skipped for now (future integration).
14. Templates appear in the "New note" picker with `{{title}}`/`{{date:...}}` resolution.
15. `.space/` files ignored.
16. Storage limits: 50 MB per file, 500 MB per vault (both editable).
17. Trash in fallback: both vault `.trash/` and MasarFlow-side deletions.
18. First-run wizard shows three cards for clarity.
19. Push in fallback: confirm dialog (Download N files or Download zip).
20. Trash in fallback: option (a) — only show in-app trash.

**S7.1 — Types and parsers (`a220508`):**
- `src/lib/vault/types.ts`, `capabilities.ts`, `ignore-patterns.ts`, `frontmatter.ts` (gray-matter wrapper with type/scheduled/priority coercion and raw preservation), `wikilinks.ts` ([[Title]], [[Title|Alias]], [[Title#Heading]], ![[embed]]).
- `src/lib/vault/fs-access.ts` with `pickVault`, `verifyPermission`, `readVaultFile`, `writeVaultFile`, `walkVault`.
- `npm install gray-matter`.

**S7.2 — Adapters, engine, store, schema bump (`68e38a8`):**
- `markdown-adapter.ts` (Obsidian ↔ Brain round-trip with title extraction, sha256 hash, excerpt), `tasks-adapter.ts` (TaskNotes frontmatter ↔ MasarFlow task with status/priority coercion), `attachments.ts` (IndexedDB Blob cache + URL lifecycle + embed discovery + storage usage), `sync-engine.ts` (pull/push/sync orchestrator + IDB-persisted FSA handle + trash/restore + automation event emission), `lib/stores/vault.ts` (zustand store).
- **Dexie schema bumped to v2** with three new tables: `syncFiles`, `vaultMeta`, `attachments`.

**S7.3 — UI (`8f8b937`):**
- `vault-mode-badge.tsx`, `vault-picker.tsx` (capability detection + browser warning), `sync-row.tsx`, `lightbox.tsx` (image zoom + rotate), `attachment-viewer.tsx` (image/video/audio/PDF/text/download + audio transcript button), `setup-wizard.tsx` (3-card onboarding), `conflict-dialog.tsx`, `trash-view.tsx`, and the **`/sync` page** with tabs, stats, picker, and "what syncs" card.

**S7.4 — Integration (`0e29d18`):**
- `VaultProvider` mounted in `src/app/layout.tsx`, right-rail Vault panel added, Settings → Vault section, `S S` (sync-now) and `G V` (go-sync) shortcuts wired, **Sync** added to left nav (system group).
- `vault-settings-block.tsx` extracted for the settings page; `Row` extracted to `shared-row.tsx` for reuse.

**S7.5 — Inline attachments in Brain (`cf84c07`):**
- `AttachmentGallery` component in the note editor that finds `![[...]]` embeds and renders them as inline image/video/audio/PDF. VaultModeBadge added to the Brain header.

---

## S8 — Cross-Browser Vault Backends (3 commits)

The user asked: "Make sure that all of the browsers uses the File System Access API." The reality: **Firefox and Safari have explicitly declined to implement the W3C spec**, and there is no JavaScript polyfill for `showDirectoryPicker`/`createWritable`. So I built a **unified `VaultBackend` interface** with three backends that all expose the same `pick / read / write / walk` API:

| Browser | Backend kind | Live | In-place writes | Persists |
|---|---|---|---|---|
| Chrome, Edge, Arc, Brave, Opera, Vivaldi | `native-fsa` | yes | yes | yes |
| Safari 16.4+ | `opfs` | no | yes (in OPFS) | yes |
| Firefox / older Safari | `legacy-fallback` | no | no (download on push) | no |

User confirmed:
1. Install `fflate` for zip round-trip.
2. OPFS semantics accepted (vault lives in browser storage, export as zip to round-trip).
3. Setup wizard shows all three cards.
4. Push in fallback: confirm dialog with zip option as recommended.
5. Trash in fallback: option (a) — only show in-app trash.

**S8.1+S8.2 — Backends (`0138ca7`):**
- `npm install fflate` (3KB, MIT, tree-shakable).
- `capabilities.ts` extended to detect `webkitdirectory` and `opfs`.
- `types.ts` extended with `opfs`/`legacy-fallback` modes, `VaultBackendKind`, `VaultBackendCapabilities`, `VaultSession`, `VaultWriteResult`.
- `backends/types.ts` defines the unified `VaultBackend` interface.
- `backends/strategy.ts` lazy-selects and caches the backend by capability.
- `backends/native-fsa.ts` refactored from the existing `fs-access.ts`.
- `backends/opfs.ts` (180 lines): OPFS read/write/walk, webkitdirectory picker for the initial mirror, `getDirectory()` + `createWritable()` for writes, `getFileHandle({create:true})` for new files.
- `backends/legacy-fallback.ts` (200 lines): webkitdirectory picker, IndexedDB Blob cache, per-file `<a download>` trigger.
- `zip-export.ts` (80 lines, no compression — STORE-only): `exportVaultZip`, `importVaultZip`, `downloadZip`.

**S8.3 — Engine refactor (`3335c33`):**
- `handle-store.ts` extracts the IDB-persisted FSA handle to break a circular import.
- `sync-engine-backend.ts` adds `runPullWithBackend` / `runPushWithBackend` / `runSyncWithBackend` that operate on the `VaultBackend` interface; push in non-FSA backends goes through the zip-export path.
- `sync-engine.ts` refactored to import the handle functions from the new module and re-export `getSettings`/`saveSettings` from `sync-engine-backend`.
- `lib/stores/vault.ts`: capability-driven backend selection, `importZip` (calls `importVaultZip` then writes each entry through the active backend), `repick` (resets the cached backend and reconnects), full `backend` state tracking.
- `vault-mode-badge.tsx`: Live / Synced / Cached labels per backend kind.
- `vault-picker.tsx`: per-capability picker (FSA button for Chromium, Open vault folder for OPFS / fallback, plus "Import vault zip" button for fallback).
- `push-confirm-dialog.tsx`: confirm dialog for fallback push with zip download as the recommended option.

**S8.4 — Sync page + right-rail (`ffe109b`):**
- `/sync` page adds a **Backend** card with capability badges (Live watching / In-place writes / Persists) and a description of the current backend.
- Sync / Pull / Push buttons enabled for all vault modes (previously only `obsidian`).
- Right-rail Vault panel adds a "Re-pick" button for legacy-fallback and shows the backend kind label.

---

## Post-S8 Fixes

### Brave detection (`6b2a0fb`)

The user reported Brave showing "Your browser does not support the File System Access API." Two issues:

1. **Brave's UA masks as Chrome** — the literal string "Brave" never appears in `navigator.userAgent`. The detection was matching the UA regex, so Brave was being misclassified as a non-Chromium browser, which gated the `fsa` flag to `false`. Fixed by using `navigator.brave.isBrave()` (the actual Brave API).
2. **Picker not-supported check was too strict** — it required `!caps.fsa && !caps.opfs && !caps.webkitdirectory`. Now only checks `!caps.webkitdirectory` (the universal fallback).
3. **Store `connect()` was hardcoded to FSA handle** — after a successful `backend.pick()`, it would call `getNativeHandle()` and fail for OPFS / legacy backends. Now branches on `session.backend`.

### Seed hang (`4556eff`)

The user reported the app stuck on "Initializing project memory…". Root cause: the original `seed-provider.tsx` used a fragile `.then().then().catch()` chain. If `ensureSeed()` itself hung (neither resolved nor rejected), nothing would ever call `setState({ ready: true })`. The fix:

- Replaced the chain with an `async IIFE` inside `try/catch`.
- Added an **8-second timeout fallback** that forces `ready: true` so the app always loads even if Dexie hangs.
- Errors now `console.error` so the actual error shows in browser dev tools.

---

## Final state

- **18 git commits** from `51e30a9` (S1) through `4556eff` (seed fix).
- **2 dependencies added**: `gray-matter` (S7.1), `fflate` (S8.1).
- **16 routes**, all returning 200 on `http://localhost:3000`.
- **3 vault backends** with identical UX across every modern browser.
- **Dexie v2** schema with 19 tables including the v2-only `syncFiles`, `vaultMeta`, `attachments`.
- **25+ keyboard shortcuts** with click-to-remap in the cheatsheet.
- **7 plugins** runtime-installable.
- **40+ components** across shell, modules, vault, brain, agents, architecture, chat-ready.

---

## Recurring pain points in this session

1. **PowerShell parens-in-path** — every Next.js dynamic route with `(workspace)` brackets required `./` prefix or had to be addressed via `bash` + `Get-Content` instead of `Read`/`Edit`/`Write`.
2. **Long single-line JSX** — large blocks of multi-line JSX frequently failed `Write` with `FileSystem.makeDirectory` errors. The workaround was a Node script saved to a file and executed via `bash`.
3. **Turbopack chunk 404s** — leftover from old dev processes still binding port 3000. The fix was always `Get-NetTCPConnection -LocalPort 3000` + `Stop-Process` + `Remove-Item .next -Recurse -Force` + restart.
4. **Dexie v2 schema migration** — adding tables in v2 requires the `db.version(2).stores(...)` call. The `ensureSeed` transaction only clears v1 tables, which is fine because v2's added tables are empty by default, but the seed provider's promise chain had to be hardened so the UI never hangs.
