# Phase 6 — Entity surfaces: one list, one detail, one inspector

**Goal:** Today, Capture, Work, Library, Ask and System are built from a shared `EntityList` / `EntityDetail` / `Inspector` driven by the entity registry, read through P2 selectors, and every task-model inconsistency is fixed.
**Branch:** `overhaul/v0.3`. **Depends on:** P2 `selectors.*`, `commands.*`; P3 `useReplicaStatus()`; P4 `useAgentTurn`, `ModelPicker`, `ApprovalCard`, `src/lib/ai/embeddings/status.ts`; P5 `SURFACES`, `SurfaceLayout`, `InspectorSlot`, `Container`. No Dexie version.
**Master:** §2 rows U2–U4, A9; decision D8. Owns `tests/e2e/feature-matrix.json` after P5.

## Verified context (read 2026-10-25)

| Fact | Evidence |
|---|---|
| Entity registry exists at `src/lib/entities/registry.ts` (6 files in `src/lib/entities`) | read earlier this session |
| `chat-view.tsx` 2,695 lines, `settings-view.tsx` 2,215 lines | audit `wc -l` |
| Today is the only place a deadline can be set | audit, `task-detail.tsx:133-269` |
| Task dialog exposes status and progress independently; assignee list includes internal agent roles | audit, `task-detail.tsx`, `workflow.ts:68-78` |

Implementers: re-read `src/lib/entities/registry.ts` and confirm the exported registry shape before T1.

## File map

New: `src/components/entity/{entity-list,entity-detail,inspector,entity-actions}.tsx`, `src/app/(workspace)/{capture,work,library,ask,system}/page.tsx` (+ layouts), `tests/unit/components/entity/*.test.tsx`, packaged specs per surface.
Modified: `src/lib/entities/registry.ts` (columns, detail sections, actions per kind), `src/components/tasks/task-detail.tsx` (T4), `src/components/today/today-view.tsx` (T2), `src/components/settings/settings-view.tsx` (split, T6), `tests/e2e/feature-matrix.json`.
Removed after each surface lands: superseded view components (list them in the commit body; P7 dead-code sweep verifies).

## Tasks

**T1 — Entity shell.** Registry gains per kind: `columns`, `filters`, `detailSections`, `actions` (all calling `commands.*`). `EntityList` (virtualised, keyboard navigable, multi-select, bulk actions, empty state with one primary action), `EntityDetail` (title, properties, body editor, links, activity from `events`), `Inspector` (properties + backlinks + "Ask about this" via `useAgentTurn`). Component tests per piece; all three inside `<Container>` with container queries only.

**T2 — Today.** Sections: Due and overdue, In progress, Inbox (unfiled captures), Recent activity, Repository status (from Dashboard). Each row opens in the inspector. Spec titles: `today: set a due date from the inspector`, `today: process an inbox item`.

**T3 — Capture.** Notes tree + editor + canvas + templates + files under one surface with section tabs; "Promote to spec/task/doc" uses commands with links. Spec: `capture: promote a note to a task keeps the link`.

**T4 — Work + task model.** One task model: `status` drives progress (progress derived for leaf tasks, aggregated for specs); due date editable in the task detail; assignee = people + "AI" (internal agent roles hidden); replica internals moved to an "Advanced" disclosure. Board/List/Specs/Sprints/Log views share `EntityList`. Unit test: status change updates spec progress through the command → `PASS`. Specs: `work: set due date in task detail`, `work: board drag updates status`.

**T5 — Library and Ask.** Library = docs, standards, architecture, graph (single graph component, `/knowledge` duplicate removed), search results with honest Semantic/Keyword labels from `embeddings/status.ts`. Ask = chat/agents/workflow modes on `useAgentTurn`. Specs: `library: graph opens an entity`, `ask: switch mode keeps thread`.

**T6 — System.** Sections: Git, Replicas (status + conflict queue from P3), Watcher, Terminal, Logs (one log surface), Features, Settings. Split `settings-view.tsx` into one file per section under `src/components/system/settings/`; each setting keeps its consumer (the `setting-consumers` guard must stay green).

**T7 — Empty the allow-lists.** Viewport-breakpoint allow-list (P5 T4) and content clipping allow-list (P5 T7) → empty. Layout harness passes at all widths in standard and studio modes.

## Gate

1. `pnpm test && pnpm lint && pnpm typecheck` → exit 0; all shrinking allow-lists touched by P5/P6 empty.
2. `pnpm e2e:desktop` green; feature-matrix count ≥ the P5 count, every entry on a new surface route.
3. `reports/v0.3/layout.json` 0 clipped controls everywhere.

## Risks / open questions

- Scope is the largest of the program → cut line: Capture inbox (master §8). Never cut the task-model fixes.

## Handoffs

P7: list of removed components, final feature-matrix, inspector/list tokens to polish.
