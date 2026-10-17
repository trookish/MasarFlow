# Hybrid Docking + Tiling Window Manager Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn every MasarFlow page into a dockable panel — a VS Code-style window manager (drag & drop, docking to edges, tab groups, resizable splits, floating windows, minimize/maximize/close, per-project saved workspaces) without rewriting any page internals.

**Architecture:** A serializable `DockNode` layout tree + a **panel registry** (pageId → page component) + a per-project persisted zustand store. The dock replaces `{children}` in `src/app/(workspace)/layout.tsx`; routes stay live (the URL always mirrors the focused panel), so all existing links, command palette pushes, and deep links keep working. Content rendering is decomposed: pure tree/geometry/serde modules (TDD, node-env tests) → zustand store (thin reducer wrapper) → React renderer (recursive tree view + pointer-based DnD, zero new deps). Panels stay **mounted when hidden** (keep-alive via `display:none`) so page state survives tab switches, drags, and minimizes.

**Tech Stack:** Next 16 App Router + React 19 (client components), zustand 5 + persist, zod 4 (serde validation), Tailwind 4 design tokens, vitest (node env). **No new npm dependencies** — pointer-events DnD, no dnd-kit.

---

## Current context / assumptions (verified in-repo)

- **Pages are thin wrappers.** All 21 routes under `src/app/(workspace)/*/page.tsx` are `export default function XPage() { return <Suspense><XView/></Suspense> }` around a `*View` component. The dock registry imports the **page modules** directly (`@/app/...`) — no per-view edits needed, and render paths stay in sync automatically.
- **Navigation is heterogeneous:** `Link` (sidebar/dashboard cards), `router.push` (command palette, global search, in-view navigation). Everything lands in the router URL. The dock syncs URL ⇄ focus, so **no call sites need changes**.
- **Views read selection from the URL at render time**: `NotesView` does `searchParams.get("note")`, `TasksView` `searchParams.get("task")`, plus standards/architecture/docs/canvas/knowledge-graph — and they push (`/brain?note=x` etc.). Therefore the URL **is** the per-panel selection state; the dock must mirror the *focused* panel's params into the URL and restore per-panel params from a snapshot when refocusing. (Verified: `src/components/brain/notes-view.tsx:24`, `src/components/tasks/tasks-view.tsx:26`.)
- **The desktop launcher does NOT host workspace pages** — it loads its own renderer (`desktop/src/main/index.ts:199-201`, pages: run/setup/config/testing). The dock is **web-only**; no dual-shell mirroring needed. `pnpm desktop:typecheck` must still pass untouched.
- **Boot gate stays put**: the Python-health gate is in `(workspace)/layout.tsx` and wraps the whole main area — the dock mounts after it clears.
- **The brain sub-layout** (`src/app/(workspace)/brain/layout.tsx` tab strip) is bypassed in docked mode on purpose: dock tab groups replace it.
- **Testing constraints:** vitest env is `node` (no DOM, no localStorage). All dock logic must live in pure functions so it is testable without DOM; the zustand store gets a memory-storage fallback for persist.
- **AGENTS.md:** this Next version differs from training data. Before writing Next-specific code (esp. `next/dynamic` + `useSearchParams`), read the relevant guide in `node_modules/next/dist/docs/`.

## The layout model (user-specified type, faithfully kept)

```ts
// src/lib/dock/types.ts
export type DockNode =
  | { type: "split"; id: string; direction: "horizontal" | "vertical"; ratio: number; children: DockNode[] } // binary (2 children) — ratio = first child's share
  | { type: "tabs"; id: string; activePage: string; pages: string[] } // pages = panel ids, unique
  | { type: "page"; id: string; pageId: string };                    // pageId = panel id

export interface FloatWindow {
  id: string;             // floater instance id
  panelIds: string[];     // panels it contains (tabs inside the floater)
  activePanel: string;
  x: number; y: number; width: number; height: number;
  z: number; minimized: boolean; maximized: boolean;
}

export interface ProjectDockState {
  version: 1;
  activeWorkspace: string;
  workspaces: Record<string, { tree: DockNode; params: Record<string, string | undefined> }>;
  floaters: FloatWindow[];
  collapsedPanels: string[];       // tiled panels collapsed to a slim bar
  maximizedPanelId: string | null; // single panel fills the workspace
  focusGroupId: string | null;     // last-focused tabs/page node id (where new pages open)
}
```

**Panel identity = page id** (`pageId` values like `"dashboard"`, `"/brain"`, `"/brain/canvas"`, `"/chat"`). Duplicates of the same page are **not** supported in v1 (opening an open page focuses it — YAGNI); params snapshots (`params[panelId]`) add per-panel selection state without remounts. `id` on every node is an intentional superset of the given type — needed for drop targets, resize, React keys, and serde stability.

**URL rule (the "don't break routing" contract):**
- URL change (link/router/back/refresh) → focus-or-open the matching panel, and if the URL carries search params, snapshot them onto the focused panel.
- Dock focus change (tab click, drag, close) → `router.replace(focusedPanelUrl)` (replace, not push, to avoid history spam).
- Views stay mounted; they re-derive from the URL only when focused, so their snapshot is restored before they become visible.

---

## Step-by-step plan

### Task 1: Dock types + panel id utilities

**Objective:** Define `DockNode`/`FloatWindow`/`ProjectDockState` and pure helpers to parse/serialize panel ids.

**Files:**
- Create: `src/lib/dock/types.ts`

**Step 1:** Write failing test `tests/unit/lib/dock/types.test.ts`:
- `pageIdOf("/brain?note=a") === "/brain"`; `paramsOf("/brain?note=a") === "note=a"`; `joinPanelId("/brain", "note=a") === "/brain?note=a"`.
- `isDockNode` type guard accepts the three node kinds and rejects `{type:"split", children:[]}` (empty children), non-binary splits (children.length !== 2 — assert in `validateNode` if added), tabs with duplicate pages, `ratio` out of [0.05, 0.95].

**Step 2:** Run `pnpm vitest run --config tests/vitest.config.ts tests/unit/lib/dock/types.test.ts` — expect FAIL.

**Step 3:** Implement `src/lib/dock/types.ts` with the types above + `pageIdOf/paramsOf/joinPanelId` (split on first `?`) + `validateNode(node): { ok: boolean; error?: string }` (also used by serde).

**Step 4:** Run test — PASS. Run `pnpm test` — no regressions.

**Step 5:** Commit: `git add tests/unit/lib/dock/types.test.ts src/lib/dock/types.ts && git commit -m "feat(dock): add dock types and panel id utils"`

---

### Task 2: Tree operations (pure, TDD)

**Objective:** All layout-tree mutations as pure functions: open, close, focus, move between zones, split at root, resize, cleanup.

**Files:**
- Create: `src/lib/dock/tree.ts`
- Test: `tests/unit/lib/dock/tree.test.ts`

**API (exported signatures):**
```ts
export function findNode(tree: DockNode, id: string): DockNode | null;
export function collectPages(tree: DockNode): string[];
export function isFocusedIn(tree: DockNode, nodeId: string, panelId: string): boolean;
export function openPanel(tree: DockNode, panelId: string, focusGroupId: string | null): { tree: DockNode; focusGroupId: string | null };
  // existing panel → focus its group; else append to focus group (or root) as a page node
export function focusPanel(tree: DockNode, panelId: string): DockNode;          // walks tabs/page nodes
export function closePanel(tree: DockNode, panelId: string): DockNode;
export function movePanel(tree: DockNode, sourcePanelId: string, targetNodeId: string | "root", zone: DockZone): DockNode;
export type DockZone = "left" | "right" | "top" | "bottom" | "tab";
export function resizeSplit(tree: DockNode, nodeId: string, ratio: number): DockNode; // clamps to [0.05, 0.95]
export function reorderTab(tree: DockNode, nodeId: string, panelId: string, index: number): DockNode;
```

**Semantics (spell out in the test file):**
- `openPanel` on a `page` node for a different page → become a `tabs` node `{activePage: new, pages: [old, new]}`.
- `movePanel(..., "left"|"right"|"top"|"bottom")` → replace the target node with a binary `split` whose children are `[source, target]` (left/top) or `[target, source]` (right/bottom), `ratio: 0.5`; if the source was a `tabs` group, move **all its pages** into a fresh `tabs` node (group drag).
- `movePanel(..., "tab")` → target becomes `tabs`, source added, `activePage = sourcePanelId`; tabs with 1 page fold to `page`; and **moving a whole group keeps the group** (source tabs node moves as-is) — normalize after.
- `closePanel` of the active tab → activate the neighbor; repeated close → cleanup.
- **Cleanup (auto-shrink)**, applied after every mutation via `normalizeTree`:
  - split with 0 children → removed; with 1 child → replaced by the child (child keeps its `id`);
  - tabs with 0 pages → removed; with 1 page → folded to `page`;
  - a `page` node whose panel id appears nowhere else stays (it IS the panel).
- `resizeSplit` only touches binary splits; ratio clamps to [0.05, 0.95]; ratios stay normalized (children sizes = ratio then 1-ratio).

**Steps:** write one behavior per test (open/focus/close/move-left/move-right/move-tab/cleanup-split/cleanup-tabs/resize/reorder, ~12-16 tests) → run, verify FAIL → implement minimal → run PASS → `pnpm test` → commit.

**Commit:** `git add tests/unit/lib/dock/tree.test.ts src/lib/dock/tree.ts && git commit -m "feat(dock): pure layout tree operations"`

---

### Task 3: Geometry module (pure, TDD)

**Objective:** Drop-zone classification and split preview math for the DnD overlay.

**Files:**
- Create: `src/lib/dock/geometry.ts`
- Test: `tests/unit/lib/dock/geometry.test.ts`

```ts
export interface Rect { x: number; y: number; width: number; height: number }
export function zoneForPoint(rect: Rect, px: number, py: number, edgeFraction = 0.28): DockZone;
  // pointer in center band → "tab"; near left/right/top/bottom edges → "left"|"right"|"top"|"bottom"
export function splitPreviewRect(rect: Rect, zone: DockZone, ratio = 0.5): Rect | null;
export function clampRatio(r: number): number; // [0.05, 0.95]
export function translateRect(rect: Rect, x: number, y: number): Rect;
```

**Steps:** pure-math tests with synthetic rects (e.g. 800×400, center point → "tab", x=40 (5%) → "left", y=380 (95%) → "bottom", corners → nearest edge; tiny rects < 40px → "tab") → RED → GREEN → commit.

**Commit:** `git add tests/unit/lib/dock/geometry.test.ts src/lib/dock/geometry.ts && git commit -m "feat(dock): drop-zone geometry helpers"`

---

### Task 4: Serde + validation (zod, TDD)

**Objective:** Persisted-layout validation, versioning, migration hook, and reconstruction of `ProjectDockState` from raw JSON with safe fallbacks.

**Files:**
- Create: `src/lib/dock/serde.ts`
- Test: `tests/unit/lib/dock/serde.test.ts`

```ts
export const dockNodeSchema: ZodType<DockNode>; // recursive, validates invariants (binary splits, unique pages)
export const projectDockStateSchema: ZodType<ProjectDockState>;
export function parseProjectState(raw: unknown): ProjectDockState | null; // null → caller uses defaults
export function migrate(raw: unknown): unknown; // version < 1 → future-proof stub
```

**Steps:** tests: valid payload roundtrips; missing `version` → null; split with 3 children → null; unknown page ids allowed (registry validates at runtime, tree stays permissive); `params` map values validated as strings; floaters with missing fields → null. RED → GREEN → commit.

**Commit:** `git add tests/unit/lib/dock/serde.test.ts src/lib/dock/serde.ts && git commit -m "feat(dock): serde validation for persisted layouts"`

---

### Task 5: Core reducers (pure state transitions, TDD)

**Objective:** Everything above tree level, as pure functions: floater ops, collapse/maximize, workspaces, URL sync — the single testable core the store wraps.

**Files:**
- Create: `src/lib/dock/dock-core.ts`
- Test: `tests/unit/lib/dock/dock-core.test.ts`

```ts
export function applyUrlFocus(state: ProjectDockState, panelId: string): ProjectDockState;
  // focus-or-open panel for panelId; snapshot params: params[panelId] = paramsOf(panelId) when the URL carries ?query
export function urlOfFocused(state: ProjectDockState, tree: DockNode): string;
  // path of the focused panel + its params snapshot, e.g. "/brain?note=a"
export function floatPanel(state: ProjectDockState, panelId: string, pos: {x: number; y: number}): ProjectDockState;
export function dockFloater(state: ProjectDockState, floaterId: string, targetNodeId: string | "root", zone: DockZone): ProjectDockState;
export function moveFloater(state: ProjectDockState, floaterId: string, pos: {x: number; y: number}): ProjectDockState;
export function resizeFloater(state: ProjectDockState, floaterId: string, size: {w: number; h: number}): ProjectDockState;
export function toggleFloaterMinimized(state: ProjectDockState, floaterId: string): ProjectDockState;
export function toggleFloaterMaximized(state: ProjectDockState, floaterId: string): ProjectDockState;
export function toggleCollapse(state: ProjectDockState, panelId: string): ProjectDockState;
export function toggleMaximize(state: ProjectDockState, panelId: string): ProjectDockState;
export function switchWorkspace(state: ProjectDockState, name: string): ProjectDockState;
export function saveWorkspace(state: ProjectDockState, tree: DockNode): ProjectDockState;   // write live tree into named workspace
export function resetWorkspace(state: ProjectDockState, name: string): ProjectDockState;   // restore preset
```

**Semantics:**
- `floatPanel` removes the panel from the tree (normalize + cleanup) and creates a floater `{w: 560, h: 420, minimized: false, maximized: false, z: nextZ}` at `pos`; if the source was a lone `tabs` group with 1 page, the page alone floats; with N pages, all N move (group float).
- `dockFloater` removes the floater and inserts **all its panels** back (group insert — same semantics as `movePanel` for a tabs source).
- `toggleMaximize`: `maximizedPanelId` set → the workspace renders only that panel; toggling again clears. Closing a maximized panel clears the id.
- `toggleCollapse`: collapsed panels render as a 32px bar in their split slot; the bar has a restore button.
- Floater with 0 panelIds after a close → floater removed.

**Steps:** ~14 focused tests (float single/group, dock back left/right/tab, minimize/restore, maximize/close-clears, workspace switch/save/reset, URL focus-open-snapshot, urlOfFocused) → RED → GREEN → `pnpm test` → commit.

**Commit:** `git add tests/unit/lib/dock/dock-core.test.ts src/lib/dock/dock-core.ts && git commit -m "feat(dock): core state transitions (floaters, workspaces, url sync)"`

---

### Task 6: Default workspace presets

**Objective:** Seed the four named workspaces (Development, Planning, Debugging, AI Research) with sensible trees.

**Files:**
- Create: `src/lib/dock/presets.ts`
- Test: `tests/unit/lib/dock/presets.test.ts`

```ts
export const WORKSPACE_PRESETS: Record<string, { tree: DockNode; params: Record<string, string | undefined> }>;
export function defaultProjectState(): ProjectDockState; // activeWorkspace: "Development"
```

Concrete seeds (each tree uses fresh node ids via an `id()` helper in `tree.ts`):
- **Development:** `split h` page `/dashboard` | page `/chat`
- **Planning:** `split v` tabs [ `/specs`, `/tasks` ] | page `/standards`
- **Debugging:** `split h` page `/devlogs` | page `/knowledge`
- **AI Research:** `split h` page `/chat` | page `/search`

**Steps:** tests assert: `defaultProjectState()` is schema-parseable, each preset validates under `dockNodeSchema`, workspaces have distinct node ids, `activeWorkspace === "Development"` → RED → GREEN → commit.

**Commit:** `git add tests/unit/lib/dock/presets.test.ts src/lib/dock/presets.ts && git commit -m "feat(dock): default workspace presets"`

---

### Task 7: Zustand store (persist, per-project, memory fallback)

**Objective:** `useDockStore` — persistence of `Map<projectId, ProjectDockState>`, transient drag state, and actions that call the pure reducers.

**Files:**
- Create: `src/lib/stores/dock.ts`
- Test: `tests/unit/lib/stores/dock.test.ts`

```ts
interface DockStore {
  projects: Record<string, ProjectDockState>;          // persisted
  drag: DockDragState | null;                          // transient (drag source, pointer, zone preview)
  activeProjectId: string | null;                      // persists so reload restores the right project
  getProject: () => ProjectDockState | null;
  setProject: (id: string | null) => void;
  // 1:1 action wrappers over dock-core reducers + a few store-side conveniences
  open: (panelId: string) => void;
  close: (panelId: string) => void;
  focus: (panelId: string) => void;
  move: (panelId: string, target: string | "root", zone: DockZone) => void;
  resize: (splitId: string, ratio: number) => void;
  float: (panelId: string, pos: {x: number; y: number}) => void;
  dockFloater: (floaterId: string, target: string | "root", zone: DockZone) => void;
  resizeFloater: (id: string, size: {w: number; h: number}) => void;
  moveFloater: (id: string, pos: {x: number; y: number}) => void;
  toggleFloaterMinimized / toggleFloaterMaximized / clearFloaterZ...
  toggleCollapse / toggleMaximize;
  setWorkspace: (name: string) => void; saveWorkspace: () => void; resetWorkspace: (name: string) => void;
  setDrag: (drag: DockDragState | null) => void;
}
```

Persistence details:
- `persist` with `name: "masarflow-dock-v1"`; `partialize` drops `drag`.
- When `activeProjectId` is set and `projects[id]` is missing → lazily initialize via `defaultProjectState()` (in `setProject`).
- **Node-env safety:** `storage: createJSONStorage(() => (typeof window !== "undefined" ? window.localStorage : memoryStorage))` where `memoryStorage` is a tiny in-file Map-backed `Storage` shim (exported for tests). Tests create the store, call actions, and assert `getState()` (persist hydration disabled in tests by calling the reducer module directly where possible).

**Steps:** store tests (node env): `setProject("p1")` initializes defaults; open/close/move flows through reducers (assert tree + floaters); partialize excludes drag; memory storage roundtrips a written state. → RED → GREEN → `pnpm test` → commit.

**Commit:** `git add tests/unit/lib/stores/dock.test.ts src/lib/stores/dock.ts && git commit -m "feat(dock): zustand store with per-project persistence"`

---

### Task 8: Page registry

**Objective:** Map every route path → page module + nav metadata; one source of truth built from `ALL_NAV_ITEMS`.

**Files:**
- Create: `src/lib/dock/registry.ts`
- Test: `tests/unit/lib/dock/registry.test.ts`

```ts
import dynamic from "next/dynamic";
export const PAGE_COMPONENTS: Record<string, React.ComponentType> = {
  "/dashboard": dynamic(() => import("@/app/(workspace)/dashboard/page"), { ssr: false }),
  "/brain": dynamic(() => import("@/app/(workspace)/brain/page"), { ssr: false }),
  "/brain/canvas": dynamic(() => import("@/app/(workspace)/brain/canvas/page"), { ssr: false }),
  "/brain/templates": dynamic(() => import("@/app/(workspace)/brain/templates/page"), { ssr: false }),
  "/brain/graph": dynamic(() => import("@/app/(workspace)/brain/graph/page"), { ssr: false }),
  "/docs": ... "/files": ... "/specs": ... "/standards": ... "/tasks": ... "/sprints": ... "/devlogs": ...
  "/architecture": ... "/knowledge": ... "/chat": ... "/agents": ... "/workflow": ... "/sync": ...
  "/watcher": ... "/search": ... "/plugins": ... "/settings": ...
};
export function getPageDef(pageId: string): { label: string; icon: LucideIcon; component?: ... } | null;
// label/icon come from ALL_NAV_ITEMS lookup (fallback: label = pageId)
export function isKnownPage(pageId: string): boolean;
```

**IMPORTANT (AGENTS.md):** read `node_modules/next/dist/docs/` for `dynamic` semantics in this Next version first; `{ ssr: false }` inside a client component must work with the app router — if the docs say otherwise, use a `<Suspense>`-wrapped static import of the page modules instead (the pages are tiny).

**Steps:** tests assert: every `/brain` child route resolves; every nav item href from `ALL_NAV_ITEMS` has a registry entry (loop over the flat list — **hard-fail if a future page is missing**); `getPageDef` returns label/icon for known ids, `null` for unknown. → RED → GREEN → commit.

**Commit:** `git add tests/unit/lib/dock/registry.test.ts src/lib/dock/registry.ts && git commit -m "feat(dock): page registry over nav definitions"`

---

### Task 9: URL ⇄ dock sync hook

**Objective:** `useDockSync` — the contract that keeps routing alive under the dock.

**Files:**
- Create: `src/lib/hooks/use-dock-sync.ts`
- Test: none (browser-only); verified via `pnpm typecheck` + e2e.

```ts
export function useDockSync(): void {
  // 1. useEffect on [pathname, search, activeProjectId]:
  //    panelId = pathname (+ "?" + search when search is non-empty)
  //    → if dock lacks it: useDockStore.getState().open(panelId) (or focus + snapshot)
  //    → if dock has it: focus + snapshot params
  //    Sets a "urlDriven" ref flag so step 2 doesn't echo the same URL back.
  // 2. useEffect on [focusedPanelUrl (derived), urlDriven]:
  //    if the URL !== focusedPanelUrl → router.replace(focusedPanelUrl)
  //    (replace, never push — keeps history clean; Back still works because
  //     user navigation changes the URL → step 1 handles it.)
  // 3. Only the ACTIVE PROJECT's dock is syncable; ignore while pythonState gate shows.
}
```

Derive `focusedPanelUrl` with `useMemo` from `projects[activeProjectId]` using `urlOfFocused`. Guard the loop with refs (`skipNextReplaceRef`) — never re-replace the URL that triggered the state change.

**Steps:** implement; `pnpm typecheck`; manual check in Step 17's verification.

**Commit:** `git add src/lib/hooks/use-dock-sync.ts && git commit -m "feat(dock): url-dock sync hook"`

---

### Task 10: Wire the dock into the workspace layout (+ classic fallback)

**Objective:** Replace `{children}` with the dock in `(workspace)/layout.tsx`, keeping a settings toggle for classic mode.

**Files:**
- Modify: `src/app/(workspace)/layout.tsx` (render `{dockEnabled ? <DockWorkspace/> : <div className="relative z-10 h-full">{children}</div>}`)
- Create: `src/components/dock/dock-workspace.tsx` (stub v1: renders `<EmptyState>` + placeholder text; filled in Tasks 11-16)
- Modify: `src/lib/stores/ui.ts` (add `dockEnabled: boolean` default `true`, persisted via partialize)

**Steps:** typecheck + `pnpm test` + manual: with `dockEnabled` true the main area shows the placeholder; flipping the flag in localStorage (`masarflow-ui` key) restores classic routing. Commit.

**Commit:** `git add -A && git commit -m "feat(dock): wire dock workspace into layout with classic fallback"`

---

### Task 11: Recursive tree renderer + keep-alive panels + tab bar

**Objective:** Render the tree: splits as flex containers with draggable dividers; `tabs`/`page` nodes as groups with a tab bar; panels mounted once and hidden via `display:none` when inactive.

**Files:**
- Create: `src/components/dock/dock-tree-view.tsx` (recursive: split → row/col + `SplitDivider`; tabs/page → `DockGroup`)
- Create: `src/components/dock/dock-group.tsx` (tab bar: tabs, `role="tablist"`, close button per tab, active tab styled `bg-accent` like the brain tabs, action buttons: float/maximize/collapse menu via `@/components/ui/dropdown-menu`)
- Create: `src/components/dock/dock-tab.tsx` (tab button w/ drag handle wrapper, `onPointerDown` → `startDrag` (Task 15), close `×`)
- Create: `src/components/dock/panel-content.tsx` (**keep-alive host**): `<Suspense fallback={<PanelSkeleton/>}><Comp/></Suspense>`; wrapper `style={{display: active ? undefined : "none"}}` (panel state fully preserved when hidden, because the component stays mounted)
- Create: `src/components/dock/split-divider.tsx` (pointer capture, live `resize(splitId, ratio)` clamp, double-click → 0.5)
- Create: `src/components/dock/panel-skeleton.tsx` (spinner, `bg-background/50`)

**Constraints:**
- `h-full min-h-0` everywhere; splits use `flex-row`/`flex-col` + `flex-basis` from ratio (first child `flex-1`-style percentage, second `flex-1`), divider = 4px `cursor-col-resize`/`cursor-row-resize`.
- **Panels stay mounted even when their tabs node is hidden by an active sibling tab** — the workspace keeps a `Map<panelId, HTMLElement>` via refs; inactive panels get `display:none`.
- Tab bar chrome: h-9, `border-b border-border`, muted text; tab close icon appears on hover/active; double-click tab title → toggle maximize.
- Style ONLY with token utilities (`bg-background`, `text-muted-foreground`, `border-border`, `bg-accent`…) per `globals.css` rules.

**Verification:** `pnpm typecheck` + `pnpm lint` + manual (`pnpm dev`): seed layout renders, tabs switch with state preserved (type a note title, switch tab, come back — title intact), dividers resize (ratios clamp).

**Commit:** `git add -A && git commit -m "feat(dock): recursive layout renderer with keep-alive panels"`

---

### Task 12: Floating windows + minimize/maximize + tray

**Objective:** Undocked floaters and the three panel states.

**Files:**
- Create: `src/components/dock/dock-floating-window.tsx` (absolutely positioned portaled window: title bar = drag (Task 15), resize handles (8 edges/corners, pointer capture), controls: minimize/maximize/close, `z` from state, `minimized` → hidden from tree, `maximized` → inset:0)
- Create: `src/components/dock/dock-tray.tsx` (bottom-right stack of minimized floater buttons + collapsed-panel restore list — restore on click)

**Behavior:** minimize clears `maximizedPanelId`; maximizing a floater keeps it above the tree; close removes panels (cleanup), floater with no panels is discarded; tray items styled as small card chips with page icons.

**Verification:** `pnpm typecheck`, manual: float a tab (via dropdown action + drag-out), resize from corners, minimize → tray → restore, maximize → restore, close → cleanup.

**Commit:** `git add -A && git commit -m "feat(dock): floating windows, minimize/maximize, tray"`

---

### Task 13: Drag & drop controller + docking overlay

**Objective:** The gesture layer: pointer-based drag of tabs/group headers/floaters, drop-zone detection against measured rects, ghost preview, docking guides, commit via store actions. **No library — pointer events + pointer capture.**

**Files:**
- Create: `src/components/dock/use-dock-dnd.ts` (controller hook: `startDrag(source: DragSource, e: PointerEvent)`; registers rects via refs; `pointermove` → `zoneForPoint` + `moveFloater` (live when dragging a floater) ; `pointerup` → commit or cancel; `Escape` cancels; `setPointerCapture` on the drag handle)
- Create: `src/components/dock/dock-overlay.tsx` (workspace-level: dims non-target areas, highlights the active drop zone with `bg-primary/20` + `border-2 border-primary/70` + label chip "Dock left/right/top/bottom/Tab"; uses `splitPreviewRect` for size; root zones shown when pointer is over empty space)
- Modify: `src/components/dock/dock-workspace.tsx` (rect registry `Map<string, Rect>` from child refs — tabs nodes and floaters register; render `DockOverlay` during drag; mount `useDockSync` here)

**DragSource type:** `{ kind: "panel"; panelId: string; nodeId: string } | { kind: "group"; nodeId: string } | { kind: "floater"; floaterId: string }`.

**Commit logic (in `use-dock-dnd`):**
- over a tabs/page node + zone `tab` → `move(panelId, targetNodeId, "tab")` (or `dockFloater`).
- zone left/right/top/bottom → `move(..., targetNodeId, zone)`.
- over root empty space → `move(..., "root", zone)`; release outside any zone while over the workspace background → `float(panelId, pointerPos)`; release over the taskbar/dock area or press Escape → cancel (snap back).
- tab reordering: drop on the tab strip → `reorderTab` with the hovered tab's index.

**Hovering (dry-run) must never mutate the tree** — zones are computed against measured rects + the original tree. The tree mutates only on `pointerup`.

**Verification:** typecheck; manual: drag a tab around (each zone highlight appears correctly; edge margins work; drop splits correctly; tab-drop merges groups; drag-out floats; Escape cancels mid-drag). Also verify against the *bottom taskbar dock* (fixed, z-40) that dragging near the bottom edge doesn't fight the taskbar popup.

**Commit:** `git add -A && git commit -m "feat(dock): pointer-based drag-drop with docking previews"`

---

### Task 14: Workspace switcher (save / switch / reset / new)

**Objective:** The multi-layout story: a topbar dropdown listing the 4 workspaces + actions.

**Files:**
- Create: `src/components/dock/workspace-menu.tsx` (dropdown via `@/components/ui/dropdown-menu`; rows: workspace list (checkmark on active), "Save current layout", "Reset workspace", "New workspace…" (inline prompt), "Rename"; kbd hint)
- Modify: `src/components/shell/topbar.tsx` (render `<WorkspaceMenu/>` next to `<ProjectSwitcher/>` with the `LayoutPanelTop`/`Layers` icon)
- Modify: `src/components/shell/shortcuts-dialog.tsx` (document new shortcuts from Task 16)

**Behavior:** Save writes the live tree into the named workspace; Reset restores its preset; New creates `"Workspace N"` from the current tree; switching swaps `activeWorkspace` and applies its tree to the view; `focusGroupId` re-points to the new tree's active group.

**Verification:** typecheck, manual: switch ws → layout swaps; save after dragging → reload → saved layout restored; reset → preset restored.

**Commit:** `git add -A && git commit -m "feat(dock): workspace switcher in topbar"`

---

### Task 15: Settings toggle + hotkeys + a11y polish

**Objective:** Feature toggle, keyboard shortcuts, accessibility, transition polish.

**Files:**
- Modify: `src/components/settings/settings-view.tsx` (new "Interface" group item: `dockEnabled` checkbox bound to `useUIStore` — find the settings-view section pattern near `src/components/settings/settings-view.tsx:793` first)
- Modify: `src/lib/hooks/use-hotkeys.ts` — additions (only when `dockEnabled`):
  - `Alt+←` / `Alt+→`: focus prev/next tab in the focused group
  - `Ctrl+Shift+K`: close focused panel (browser-safe; Ctrl+W is not)
  - `Escape`: cancel an active drag (already the DnD path)
  - `Alt+Enter`? — no; avoid. Maximize/restore via double-click + buttons only.
- Modify: `src/components/ui/tabs.tsx`? **No** — dock has its own tab bar; leave shared primitives untouched.
- Accessibility: `role="tablist"`/`role="tab"`/`aria-selected` on the group tab bar, `aria-label` on every icon button, focus-visible rings on tabs/dividers, `aria-keyhortcuts` not needed.
- Transitions: `transition-all duration-150` on tab hover/active; overlay fades (`opacity`); divider hover shows accent; floater drag is direct (no transition during drag — set `transition-none` while moving). Keep everything subtle — no layout animations (contents are heavy).

**Verification:** `pnpm test`, `pnpm lint`, `pnpm typecheck`; manual: hotkeys work, screen-reader labels present, drag UX feels smooth (no jank, no animation lag).

**Commit:** `git add -A && git commit -m "feat(dock): settings toggle, hotkeys, a11y polish"`

---

### Task 16: Final integration review + full verification

**Objective:** Full pipeline, pre-commit review, and honest verification.

1. `pnpm test` — full unit suite (existing ~434 tests + ~45 new dock tests).
2. `pnpm lint` — 0 errors (4 pre-existing `<img>` warnings are baseline).
3. `pnpm typecheck` and `pnpm desktop:typecheck` (desktop untouched, must stay green).
4. `pnpm build` — production build passes (catches lazy-import/SSR issues).
5. Run `requesting-code-review` (diff scan + independent reviewer subagent) on the final diff.
6. Manual e2e checklist with `pnpm dev` (Python sidecar required — use `pnpm dev:full` or `pnpm start`):
   - [ ] Deep links: load `/brain?note=1` directly → Notes panel opens with that note selected; URL reflects it.
   - [ ] Command palette "new task" → Tasks panel opens/focuses; URL `/tasks`.
   - [ ] Sidebar navigation: clicking an open page focuses it (no duplicate panels).
   - [ ] Drag: dock left/right/top/bottom → correct splits; tab-drop → group merge; drag out → float; Escape cancels.
   - [ ] Resize: dividers drag live, clamp at 5%, double-click resets 50/50.
   - [ ] Minimize tiled → slim bar + restore; maximize panel → fills workspace, restore works; closing maximized panel clears state.
   - [ ] Floater: move, 8-way resize, minimize → tray → restore, maximize, close → cleanup.
   - [ ] Empty split cleanup: close all panels in a region → splits dissolve; root empty → empty-state with "Open a page" shortcuts.
   - [ ] Workspaces: switch/save/reset/new; reload persists per-project layout; switching projects loads that project's layout.
   - [ ] State preservation: begin a chat reply (streaming), switch tabs, return — stream intact; canvas zoom state intact; notes editor draft intact; a panel hidden via `display:none` keeps its scroll position.
   - [ ] Classic fallback: toggle `dockEnabled` off in Settings → routing layout renders exactly as before.
   - [ ] `/` redirect, back/forward history, refresh — all resolve to the focused panel.

**Commit:** `git add -A && git commit -m "feat: dockable panel window manager (tiling + floating)"` (after review passes)

---

## Files summary

**New (lib, pure — TDD):**
`src/lib/dock/types.ts`, `tree.ts`, `geometry.ts`, `serde.ts`, `dock-core.ts`, `presets.ts`, `registry.ts` · `src/lib/stores/dock.ts` · `src/lib/hooks/use-dock-sync.ts`

**New (components):**
`src/components/dock/dock-workspace.tsx`, `dock-tree-view.tsx`, `dock-group.tsx`, `dock-tab.tsx`, `dock-panel-frame.tsx` (if needed for page-node chrome), `panel-content.tsx`, `panel-skeleton.tsx`, `split-divider.tsx`, `dock-floating-window.tsx`, `dock-tray.tsx`, `dock-overlay.tsx`, `workspace-menu.tsx`, `use-dock-dnd.ts`

**New (tests):**
`tests/unit/lib/dock/{types,tree,geometry,serde,dock-core,presets,registry}.test.ts`, `tests/unit/lib/stores/dock.test.ts`

**Modified:**
`src/app/(workspace)/layout.tsx` · `src/lib/stores/ui.ts` · `src/components/shell/topbar.tsx` · `src/components/shell/shortcuts-dialog.tsx` · `src/lib/hooks/use-hotkeys.ts` · `src/components/settings/settings-view.tsx`

**Untouched by design (explicit):** all `page.tsx` + `*View` files (pages keep responsibility for content/state), `src/app/(workspace)/brain/layout.tsx` (rendered only in classic mode), every `desktop/**` file.

---

## Risks / tradeoffs / open questions

| Risk | Mitigation |
|---|---|
| Views read selection from the **global** URL (`useSearchParams`) — hidden panels would re-derive from the focused panel's URL | Per-panel params snapshot restored on focus; panels only *become* visible after the URL rewrite (display:none until the active panel's URL is set). Verified against `notes-view.tsx:24` / `tasks-view.tsx:26` (both read at render). |
| Keep-alive (`display:none`) + React Flow/CodeMirror sizing | Both use ResizeObserver — panels re-measure when un-hidden; verified manually in Task 16. |
| DnD is the riskiest hand-rolled piece | Zone math is a pure, TDD'd module; tree mutates only on commit; Escape/drag-out fallbacks; worst case, "Float" menu action still works without drag. |
| Browser-reserved shortcuts | Only browser-safe combos (`Alt+←/→`, `Ctrl+Shift+K`); no Ctrl+W/Ctrl+Tab. |
| Per-project persistence growth | Layout JSON is tiny; zustand-persisted, schema-validated (zod) — invalid payloads fall back to defaults, never crash. |
| Dupes of the same page ("open `/brain` twice") | v1: focus existing panel (YAGNI) — documented; multi-instance would need panel-instance ids (sidecar) later. |
| Manual e2e needs the Python sidecar | `pnpm dev:full` (script spawns it); smoke tests in `tests/e2e/smoke.spec.ts` remain valid (shell + "New note" flows unaffected) — run `pnpm e2e` if the sidecar is healthy. |

**Open questions (defaults chosen — flag if you disagree):**
1. *Multi-instance panels (duplicate page)?* — **No for v1**; focus existing instead.
2. *Default mode?* — **Docked on**, classic mode available via Settings → Interface toggle (zero-risk fallback).
3. *Floaters persist across workspace switches?* — **Per project, shared across workspaces** (they're detached state).
4. *New-panel placement?* — **In the last-focused group** when one exists, else root.
5. *DnD library?* — **None**; pointer events + pure geometry (keeps bundle + design system intact).

**Execution note for subagents:** Tasks 1-6 are pure-TDD node tests (RED→GREEN each). Tasks 7-8 add store/registry. Tasks 9-15 are renderer/UI (typecheck + manual verification, no DOM tests — vitest is node-only). Never touch `page.tsx`/`*View` files or `desktop/**`; run `pnpm test && pnpm lint && pnpm typecheck && pnpm desktop:typecheck` after every renderer task.
