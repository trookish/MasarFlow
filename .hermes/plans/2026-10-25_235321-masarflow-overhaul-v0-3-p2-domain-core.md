# Phase 2 — Domain core: one write path, events, tombstones, cascades

**Goal:** every mutation of project data goes through `src/lib/domain/commands/*` in one Dexie transaction that keeps rows, links, denormalised arrays and the event feed consistent; deletes are tombstones; project delete leaves zero orphans.
**Branch:** `overhaul/v0.3`. **Depends on:** P0 T5 (`runDoctor` in `src/lib/db/doctor.ts`, baseline `reports/v0.3/data-doctor.json`).
**Master:** §2 rows D5, D6, D7, D9; decisions D2, D3; Dexie budget: **this phase owns `version(13)` only**.

## Verified context (read 2026-10-25)

| Fact | Evidence |
|---|---|
| Highest schema is `version(12)` (activity) | `src/lib/db/index.ts:241-243` |
| `PROJECT_TABLES` lists 20 tables; `remove` deletes by `projectId`, then canvas nodes/edges, then the project | `src/lib/db/repos/projects.ts:5-26,74-89` |
| Tables present but missing from `PROJECT_TABLES` include `watchEvents, plugins, workflowRuns, workflowSteps, codeFindings, linkSuggestions, parsedContents, aiUndo, chatThreads, chatMessages, linkedProjects, activity, embeddings, agentSteps` | table names from `src/lib/db/index.ts` stores; per-table `projectId` index **must be checked per table** (some key by `threadId`/`runId`) |
| `tasksRepo.remove` is a bare `db.tasks.delete(id)` | `src/lib/db/repos/tasks.ts:51-53` |
| `notesRepo.remove` removes links then the note | `src/lib/db/repos/notes.ts:105-107` |
| Activity and dirty tracking are Dexie hooks over every table | `src/lib/activity/track.ts:107-113`, `src/lib/db/dirty.ts:4,23-27` |
| `dirty.ts` `IGNORED` = embeddings, watchEvents, parsedContents, activity (not `syncFiles`) | `src/lib/db/dirty.ts:4` |
| 29 repo modules under `src/lib/db/repos/` | `ls` 2026-10-25 |

## Findings that shape this phase

| # | Finding | Consequence |
|---|---|---|
| F1 | Cascades live in whichever repo the author remembered | Commands own cascades; repos lose mutating methods at the end of the phase |
| F2 | Hooks see every write including imports and replicas | Commands emit explicit `events`; `track.ts` hooks are removed once all writers are commands (T7) |
| F3 | `syncWikilinks` → `ensureByTitle` creates notes on save (audit: `notes.ts:88,101,114-133`) | Wikilinks become unresolved links until the user clicks "Create" |

## File map

New: `src/lib/domain/commands/{index,notes,docs,specs,tasks,projects,links}.ts` (T2–T5), `src/lib/domain/events.ts` (T1), `src/lib/domain/live.ts` (T1), `src/lib/domain/selectors/*.ts` (T6), `tests/unit/lib/domain/*.test.ts` (each task), `eslint-rules/no-direct-db-writes.mjs` (T7).
Modified: `src/lib/db/index.ts` (+`version(13)`, T1), `src/lib/db/schema.ts` (T1), `src/lib/db/dirty.ts` (T1), `src/lib/db/repos/*.ts` (T6), `src/lib/activity/track.ts` (T7), `src/lib/db/repos/notes.ts` (T4), components calling repo mutators (T6), `eslint.config.mjs` (T7).

## Tasks

**T1 — Schema v13.** `version(13).stores({ events: "id, projectId, [projectId+at], [entityKind+entityId]", notes: "<existing>, deletedAt", docs: …, specs: …, tasks: … })` — copy each existing index string verbatim from the latest version that defines it and append `, deletedAt`. `upgrade()` sets nothing (absent = live). `Event = {id, projectId, at, entityKind, entityId, op: "create"|"update"|"remove"|"restore"|"purge", actor: "user"|"ai"|"import"|"replica", patch?: Record<string, unknown>}`. `live.ts`: `export const isLive = (r: {deletedAt?: number|null}) => r.deletedAt == null`. Add `syncFiles` and `events` to `dirty.ts` `IGNORED` (fixes D9). Tests: open a v12 fixture DB, upgrade, assert rows preserved and `events` exists → `PASS (2 passed)`.

**T2 — Command kernel.** `commands/index.ts` exports `runCommand<T>(tables, actor, fn: (tx: CommandTx) => Promise<T>)` that opens `db.transaction("rw", [...tables, db.events], …)`, collects `tx.emit(event)` calls, bulk-adds events at the end. No secret-store or network await allowed inside `fn` (document; P4 tools must hydrate before). Tests: emitted events persist on success, none on throw → `PASS (2 passed)`.

**T3 — Task, spec, doc commands with cascades.** `commands.tasks.remove(id)`: set `deletedAt`, remove `links` touching the task, pull the id from every spec/doc `linkedTaskIds`, recompute owning spec progress (reuse the existing progress function — locate it with `rg -n "progress" src/lib/db/repos/specs.ts`), emit events. `restore(id)` reverses tombstone and re-adds the id only where the spec still exists. `purge(id)` hard-deletes a tombstoned row. Same shape for specs (cascade: tasks keep, `specId` cleared) and docs. Tests per kind: create→link→remove→doctor reports 0 `dangling-links` and 0 `stale-linked-task-ids`; restore round-trip → `PASS (6 passed)`.

**T4 — Notes and wikilinks.** `commands.notes.save(id, patch)` parses wikilinks and writes `links` rows with `toId` resolved by title or `unresolvedTitle` when absent — it never creates notes. Add `commands.notes.createFromLink(title)` used by a "Create note" action in the preview. Tests: saving `[[Missing]]` creates 0 notes and 1 unresolved link; `createFromLink` resolves it → `PASS (2 passed)`. Feature-matrix: add `brain: create note from unresolved link` with its spec in the same commit.

**T5 — Project delete is complete.** Replace the hard-coded `PROJECT_TABLES` with discovery: every table whose `schema.indexes` include `projectId`, plus child tables keyed through a parent (`canvasNodes/canvasEdges` by `canvasId`, `chatMessages` by thread, `agentSteps` by run, `workflowSteps` by run — confirm each key by reading its store string). Keep an explicit `PROJECT_CHILD_TABLES` map for the second group and a unit test that fails if a new table has neither `projectId` nor a map entry (iterate `db.tables`). Secrets: call the chat-secrets cleanup **before** the transaction. Test: seed one row in every table, delete project, `runDoctor` → all 0 → `PASS (2 passed)`.

**T6 — Move writers onto commands.** Mechanical: for each repo mutator, create the command, change callers, keep the repo method as a thin deprecated wrapper for one commit, then delete it. Selectors filter `isLive` by default; Trash view (`selectors.trash(projectId)`) reads tombstones. Order: tasks, specs, docs, notes, folders, canvases, then the rest. Run `pnpm test` after each kind.

**T7 — Enforce.** Custom ESLint rule `no-direct-db-writes` flags `db.<table>.(add|put|update|delete|bulkAdd|bulkPut|bulkDelete|clear)` outside `src/lib/domain/**`, `src/lib/db/**` (migrations/backup) and `tests/**`. Remove activity hooks from `track.ts`; `activity` becomes a projection of `events` (keep the table; write it from `runCommand`). Tests: activity timeline component test still passes with events.

## Gate

1. `pnpm test && pnpm lint && pnpm typecheck` → exit 0; `no-direct-db-writes` reports 0.
2. `pnpm doctor:data` after the scripted delete-project journey → every count 0 (compare with the P0 baseline in the commit body).
3. `pnpm e2e:desktop` green, including `brain: create note from unresolved link`.

## Risks / open questions

- Hidden writers in components (179 direct db/live-query imports, audit) → T7 rule is the backstop; run it in warn mode first, list offenders, then error.
- Activity hooks removal changes timing of the activity feed → `events` are written in the same transaction, so ordering improves.

## Handoffs

P3/P4/P6 consume `runCommand`, `commands.*`, `isLive`, `selectors.*`, `events`. P3 must use `actor: "replica"`, P4 `actor: "ai"`.
