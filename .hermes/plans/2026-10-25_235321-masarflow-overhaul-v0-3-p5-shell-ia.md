# Phase 5 — Shell and information architecture

> **Amendment — tabs-only project harness (2026-10-27).** The Studio/split-dock direction is superseded by the product owner's explicit instruction. MasarFlow ships one shell: six surfaces in the left navigation, one linear project tab strip, one active workspace, and the right inspector. Remove layout presets, split/floating/maximize/collapse controls, the Studio setting, and dock-specific palette commands. Preserve per-project open pages, per-tab URL selection, recent tabs, close/reopen, and bounded keep-alive using the existing dock state engine after normalizing legacy layouts to flat tabs. Keyboard acceptance: Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab cycle tabs, Ctrl/Cmd+W closes the active tab, arrows navigate the tablist, and no docking controls remain. Packaged acceptance: the same spec proves tab navigation, per-project isolation, selection persistence, close/reopen, and zero axe violations. This amendment supersedes T5/T6 and every Studio reference below; the surface map and legacy redirects remain unchanged.

**Goal:** replace the 30-destination module catalogue with six labeled surfaces (Today, Capture, Work, Library, Ask, System) in a sidebar + tabs + main + inspector project harness that fits every window from 1000 px; every old URL still resolves.
**Branch:** `overhaul/v0.3`. **Depends on:** P0 T6 layout harness (`reports/v0.3/layout.json`). Runs in parallel with P1/P2 (disjoint files).
**Master:** §2 rows U1–U3; decision D7. **Single owner of** `src/lib/nav.ts`, `src/app/(workspace)/layout.tsx`, `src/lib/stores/ui.ts`.

## Verified context (read 2026-10-25)

| Fact | Evidence |
|---|---|
| 24 workspace route directories under `src/app/(workspace)/` | `ls` |
| `src/lib/nav.ts` has 30 `href:` entries | `rg -c 'href:'` |
| UI store persists `activeNavGroup: "Capture"`, `sidebarCollapsed` etc. | `src/lib/stores/ui.ts:37-45` |
| Layout renders `DockWorkspace` when `dockEnabled` | `src/app/(workspace)/layout.tsx` (read earlier; delegate cites `:176-201`) |
| UI primitives available: badge, button, card, command, confirm-dialog, context-menu, dialog, dropdown-menu, empty-state, input, kbd, scroll-area, tabs, textarea, toaster, tooltip | `ls src/components/ui` |
| Repo-truth guards: `anchor-contract`, `dead-routes`, `setting-consumers`; plus `tests/unit/nav-parity.test.ts` | `ls` |

Audit-sourced: defaults `dockEnabled: true`, `taskbarDirection: "bottom"` (`stores/ui.ts` — confirm the exact lines); `/knowledge` and `/brain/graph` render the same graph component; 28 viewport `md:/lg:` breakpoints inside panel content vs 2 container queries; dock panels never unmount.

## Surface map (the contract for P6)

| Surface | Route | Absorbs (old routes → redirect) |
|---|---|---|
| Today | `/today` | `/dashboard` (widgets move into Today's right column) |
| Capture | `/capture` | `/brain`, `/brain/canvas`, `/brain/templates`, `/files` |
| Work | `/work` | `/tasks`, `/sprints`, `/specs`, `/devlogs` (views: Board, List, Specs, Sprints, Log) |
| Library | `/library` | `/docs`, `/standards`, `/architecture`, `/knowledge`, `/brain/graph`, `/search` |
| Ask | `/ask` | `/chat`, `/agents`, `/workflow` (modes) |
| System | `/system` | `/git`, `/sync`, `/watcher`, `/tools`, `/plugins`, `/control-center`, `/settings` (sections) |

## File map

New: `src/lib/navigation/{surfaces,redirects}.ts`, `src/components/shell/{surface-layout,inspector-slot,sidebar-v2}.tsx`, `src/components/ui/container.tsx`, `tests/unit/lib/navigation/*.test.ts`, `tests/e2e/desktop/shell.spec.ts`.
Modified: `src/lib/nav.ts` (re-exported from `surfaces.ts`), `src/app/(workspace)/layout.tsx`, `src/lib/stores/ui.ts` (+ migration), `next.config.ts` (`redirects()`), `src/lib/dock/registry.ts`, `src/components/dock/*` (T6), `tests/unit/nav-parity.test.ts`, `tests/unit/repo-truth/dead-routes.test.ts`, `tests/e2e/feature-matrix.json`.

## Tasks

**T1 — Surface model.** `surfaces.ts` exports `SURFACES` (id, label, icon, route, sections[]) per the map above and `surfaceForPath(pathname)`. Test: every current `href` in `nav.ts` maps to exactly one surface; `surfaceForPath("/brain/graph") === "library"` → `PASS (2 passed)`.

**T2 — Redirects.** `redirects.ts` exports `LEGACY_REDIRECTS: {source, destination}[]` (e.g. `/tasks` → `/work?view=board`, `/knowledge` → `/library?view=graph`, `/brain/:path*` → `/capture/:path*`, deep entity links preserved). Wire into `next.config.ts` `redirects()` — read `node_modules/next/dist/docs/` for the Next 16 `redirects` signature first. Test: every old route directory name appears as a `source`; no `destination` is itself a `source` (no chains) → `PASS (2 passed)`. Update `dead-routes` guard so redirected routes count as reachable.

**T3 — Shell.** `SurfaceLayout` = labeled sidebar (220 px, collapsible to 56 px with tooltips), main, `InspectorSlot` (320 px, resizable, closes below 1100 px main width into a sheet). Sidebar shows the six surfaces, the project switcher, and a "Recent" list from `events` (P2) if available else from `activity`. Command palette (`src/components/ui/command.tsx`) becomes the single search entry (merge the 3 search UIs: keep one `Ctrl+K`). Packaged spec `shell: navigate every surface by label` + matrix entry.

**T4 — Container primitives.** `container.tsx` exports `<Container name>` (`container-type: inline-size`) and a lint check (`tests/unit/repo-truth/no-viewport-breakpoints.test.ts`) that fails on `\b(sm|md|lg|xl):` inside `src/components/**` except `src/components/shell/**`, using a shrinking allow-list seeded from today's offenders. P6 empties the list.

**T5 — Store migration.** `ui.ts` persist `version` bump with `migrate`: `dockEnabled` → `layoutMode: "studio"` only if the user ever changed dock settings, otherwise `"standard"`; `activeNavGroup` dropped. Show a one-time notice offering Studio layout. Test the migrate function on three stored shapes → `PASS (3 passed)`.

**T6 — Studio layout.** Dock remains available as `layoutMode: "studio"`: panels host surfaces (not old pages), max 4 mounted panels (LRU unmount beyond), tablist gets real `role="tab"` children (fixes the a11y `aria-required-children` on every route). Spec `shell: studio layout keeps four panels`.

**T7 — Flip the layout harness to failing.** `audit-layout.spec.ts` fails on any clipped control in standard mode at 1000/1280/1440/1920. Fix offenders in the shell; content offenders are P6's (listed in a shrinking allow-list).

## Gate

1. `pnpm test && pnpm lint && pnpm typecheck` → exit 0.
2. `pnpm e2e:desktop` green; every old URL in `LEGACY_REDIRECTS` lands on a rendered surface (spec iterates the table).
3. `reports/v0.3/layout.json`: 0 clipped shell controls at all four widths.

## Risks / open questions

- Feature-matrix titles are keyed by route → rename titles to the new surface routes in the same commit as each redirect; the guard proves nothing was dropped (count stays ≥ 55).
- "Plugins" renamed to "Features" in UI copy only (master Q2).

## Handoffs

P6: `SURFACES`, `SurfaceLayout`, `InspectorSlot`, `Container`, viewport-breakpoint allow-list to empty, the content clipping allow-list.
