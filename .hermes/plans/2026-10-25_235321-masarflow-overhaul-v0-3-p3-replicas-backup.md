# Phase 3 — Replicas (vault + Obsidian) and backup v2

**Goal:** the folder mirror and the Obsidian REST mirror are two adapters of one replica engine that never loses an index row, never resurrects deleted entities, honours `autoImport`, runs app-wide, and shares one codec; backups validate before import and round-trip losslessly.
**Branch:** `overhaul/v0.3`. **Depends on:** P2 `runCommand`, `commands.*`, `deletedAt` tombstones (`src/lib/domain/live.ts` `isLive`). **Dexie:** this phase owns `version(14)` only.
**Master:** §2 rows D1–D4, D8, D10–D12; decision D4.

## Verified context (read 2026-10-25)

| Fact | Evidence |
|---|---|
| `syncRepo.replaceAll` deletes every project row then `bulkAdd`s with fresh `uuid()` ids | `src/lib/db/repos/sync.ts:18-27` |
| Writers of `replaceAll`: vault engine, sync-view, vault-panel, slash-commands, demo-seed | `rg -l replaceAll\|useVaultSync src` 2026-10-25 |
| Planner: unclaimed mirrored file → `{action:"external"}` | `src/lib/vault/plan.ts:157-160` |
| `indexRowFor` returns `null` for `external` and `ignore` | `plan.ts:202-204` |
| `remote_modified` → `import` with `auto: input.autoImport`; engine ignores `auto` and imports anyway | `plan.ts:150-152`, `engine.ts:175-179` |
| `adoptExternal` creates a new entity for every external file, ignoring the file's `msf_id` | `engine.ts:104-135,183-196` |
| Engine writes the index once at the end via `replaceAll(projectId, ctx.rows)` | `engine.ts:219-221` |
| Conflict resolution rewrites the whole index too | `engine.ts:226-253` |
| `APP_VERSION = "0.2.0.0"` hard-coded | `src/lib/db/auto-backup.ts:7` |
| `syncFiles` not in `dirty.ts` `IGNORED` (fixed in P2 T1) | `src/lib/db/dirty.ts:4` |

Audit-sourced, **re-read before editing**: second serializer in `src/lib/sync.ts:136` emits `msf_project: <uuid>` while `plan.ts:74` emits the slug; `sync-view.tsx:155,168,254,329,615` writes the index from local scan and Obsidian REST; `backup-import.ts` is an unvalidated `bulkAdd`; `useVaultSync` is mounted only by `vault-panel.tsx`.

## File map

New: `src/lib/replica/{types,engine,codec,index-store,runner}.ts`, `src/lib/replica/adapters/{folder,obsidian}.ts`, `src/lib/db/backup-v2.ts`, `tests/unit/lib/replica/*.test.ts`, `tests/e2e/desktop/replica.spec.ts`.
Modified: `src/lib/db/index.ts` (+`version(14)`), `src/lib/db/repos/sync.ts` (T1), `src/components/sync/sync-view.tsx` (T6), `src/components/vault/vault-panel.tsx` (T5), `src/app/(workspace)/layout.tsx` — **one line** to mount the runner provider; coordinate with P5 owner (T5), `src/lib/db/auto-backup.ts` (T7), `src/lib/db/backup-import.ts` (T7).
Deleted at the end (T8): `src/lib/vault/engine.ts`, `src/lib/sync.ts` serializer half, `src/lib/hooks/use-vault-sync.ts` — after `rg` shows no importers.

## Tasks

**T1 — Index store, upsert-only.** `version(14)`: `syncFiles: "id, projectId, &[projectId+adapter+entityKind+entityId], [projectId+adapter+path]"` and `replicaConflicts: "id, projectId, [projectId+adapter], entityId"`. Upgrade dedupes existing rows by `(projectId, entityType, entityId)` keeping the newest `lastSyncedAt`, sets `adapter: "folder"` (or `"obsidian"` where the row came from REST — detect by the sync-view path prefix; if not determinable, `"folder"`). `index-store.ts`: `upsert(row)`, `remove(key)`, `list(projectId, adapter)`; no `replaceAll`. Tests: upsert twice keeps one row and the same `id`; upgrade dedupes a fixture with duplicates → `PASS (3 passed)`.

**T2 — One codec.** `codec.ts` `encode(entity, ctx)` / `decode(text)` with frontmatter `msf_id`, `msf_kind`, `msf_project` (**slug**), `msf_version: 2`, `msf_updated`. Absent `msf_version` → decode as v1 (accept uuid or slug for `msf_project`). Hash = `hashContent(normalizeMd(body+stable frontmatter))` excluding `msf_updated`. Tests: encode→decode identity for each kind; v1 input decodes; hash stable across two encodes 1 ms apart → `PASS (5 passed)`.

**T3 — Planner semantics.** Port `planVaultSync` into `replica/engine.ts` with these changes, each with a failing test first:
1. tombstoned entity + file unchanged since base → `{action: "trash-file"}` (moves the file to `.masarflow-trash/`), never `external`;
2. file with `msf_id` matching a tombstoned entity → `conflict` (`reason: "deleted-in-app"`), not adopt;
3. file with `msf_id` matching a live entity at a different path → `repath`;
4. unclaimed file without `msf_id` → `untracked` (listed, not adopted); adoption only through `commands.replica.importFolder()`;
5. `remote_modified` with `autoImport=false` → `pending-import` row, no entity write.
→ `PASS (5 passed)`.

**T4 — Executor writes per action.** Each action applies its entity change through `runCommand(..., "replica", …)` and upserts its own index row immediately; a crash mid-run loses at most the current action. Conflicts insert `replicaConflicts` rows. Tests with an in-memory `VaultIO` fake (`src/lib/vault/io.ts` interface): kill after 2 of 5 actions → rerun converges with 0 duplicates; delete entity → file moved to trash, not re-imported on next run → `PASS (2 passed)`.

**T5 — App-level runner.** `runner.ts` exports `ReplicaRunnerProvider` (single interval + focus/visibility trigger + manual `runNow`, mutex per project) and `useReplicaStatus()`. Mount once in the workspace layout (one line; P5 owns the file — land this first or rebase). `vault-panel.tsx` stops mounting `useVaultSync` and reads status. Test: two concurrent `runNow` calls produce one run.

**T6 — Obsidian adapter.** Implement `ReplicaAdapter` over the existing `/api/obsidian/*` routes (header auth from P1 T5). `sync-view.tsx` becomes a status/conflict view over `useReplicaStatus()` and `replicaConflicts`; it no longer computes or writes index rows. Packaged spec `sync: resolve a conflict from the queue` + feature-matrix entry.

**T7 — Backup v2.** `backup-v2.ts`: `{format: "masarflow-backup", dataVersion: 3, appVersion: APP_DISPLAY_VERSION, tables}`; import validates every row with its zod schema from `src/lib/db/schema.ts`, runs in one transaction, refuses unknown `dataVersion`, migrates `dataVersion 2` (0.2.x) forward, reports per-table counts, and lists AI connections whose keys were redacted so the UI can ask the user to re-enter them. `auto-backup.ts` imports the version from `desktop/src/shared/version.ts` (via the existing `@desktop-shared` alias) instead of the literal. Tests: invalid row → whole import rejected with table+row index; 0.2 fixture imports; round trip then `runDoctor` all 0 → `PASS (3 passed)`.

**T8 — Remove the old paths.** Delete files listed above once `rg -n "lib/vault/engine|lib/hooks/use-vault-sync|syncRepo.replaceAll" src` is empty. Keep `src/lib/vault/{io,paths,serialize}.ts` only if the new code imports them.

## Gate

1. `pnpm test && pnpm lint && pnpm typecheck` → exit 0.
2. `pnpm e2e:desktop` green including `sync: resolve a conflict from the queue` and a scripted journey: create note → sync → delete note → sync → file in `.masarflow-trash/`, note not recreated.
3. `pnpm doctor:data` → `duplicate-sync-paths` 0, `sync-rows-without-entity` 0 after the journey.
4. Backup → restore round trip on the demo project → doctor all 0.

## Risks / open questions

- Users with a v1 mirror get one rewrite per file when `msf_version` is added → acceptable; happens lazily on next local change only (master Q4).
- `.masarflow-trash/` inside the user's vault may surprise Obsidian users → document in the Sync surface; folder is dot-prefixed so Obsidian hides it.

## Handoffs

P6 Library/System surfaces use `useReplicaStatus()`, `replicaConflicts`, `commands.replica.importFolder()`.
