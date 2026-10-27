# Architecture

The shape of MasarFlow 0.3, for contributors. Decisions referenced as D1–D12 / Q3 live in the master plan
(`.hermes/plans/`); this page is the durable summary.

## One app (D1)

The Electron app *is* MasarFlow. Its window hosts the existing Next app (`src/`); the old separate launcher
is retired.

- **Electron main** (`desktop/src/main/`) — lifecycle, single-instance, tray, menu, and the typed IPC
  surface (`ipc/*`: app, dialog, shell, window, secrets, roots, backups, git, terminal, updater,
  diagnostics).
- **Embedded server** — Next is built with `output: "standalone"` and runs in an Electron `utilityProcess`
  on `127.0.0.1:<ephemeral port>` behind a per-launch random token (D2).
- **Stable origin** — the window loads `masarflow://app/`; a privileged-scheme handler proxies each request
  to the loopback server and injects the token header. The origin never changes, so IndexedDB survives
  restarts (a random port would silently lose all data).
- **Renderer** — the Next app itself: dock + pages, Dexie (IndexedDB) as the system of record, an
  embeddings Web Worker, the chat context engine and workspace tools. API routes (`src/app/api/*`) run in
  the embedded server.

```
┌────────────── Electron main ──────────────┐
│ index.ts (lifecycle, tray, menu)          │
│ backend/server.ts ── utilityProcess ──►   │
│   Next standalone  127.0.0.1:<port>       │
│ backend/protocol.ts  masarflow://app ──►  │
│   proxy (+ token header, + CSP)           │
│ security/roots.ts  roots.json ◄── picker  │
│ ipc/* (typed, contextIsolated preload)    │
└──────────────┬────────────────────────────┘
               │ window.masarflow (preload)
┌──────────────▼────────────── Renderer ────┐
│ Dock + pages ◄─ EntityRef/openEntity/     │
│   ActiveContext (derived from dock)       │
│ commands ──► Dexie + events ──► activity │
│ Embeddings Web Worker (transformers.js)   │
│ runAgentTurn ── toolsets ── approvals     │
└───────────────────────────────────────────┘
```

## Six surfaces

The sidebar shows six surfaces; each hosts the pages it owns as sections (`src/lib/navigation/surfaces.ts`).
Standard is the default layout; Studio (the dock) is opt-in and keeps at most four panels mounted, unmounting
the least recently shown hidden tab (`src/lib/dock/mount-cap.ts`).

| Surface | Sections |
| --- | --- |
| Today | Focus (overdue, due today, in progress, inbox), Dashboard |
| Capture | Notes, Canvas, Templates, Files |
| Work | Task boards, Specifications, Sprints, Dev logs |
| Library | Documentation, Standards, Architecture, Knowledge graph, Semantic search |
| Ask | Chat, AI agents, AI workflow |
| System | Settings, Control Center, Git, Sync, Project watcher, Features, Terminal, Logs, System info |

## One write path (0.3)

Every user-visible change goes through a domain command (`src/lib/domain/commands/`). `runCommand` opens one
Dexie read-write transaction over the tables the command touches plus `events`, and writes the events the
command emitted at the end of that transaction: the feed never disagrees with the data, and a throw rolls
back both. Nothing outside IndexedDB is awaited inside a command (secret store, network, IPC).

```
UI / AI tool / sync ──► command (tasks, notes, projects, trash, promote)
                          │  one transaction
                          ├─► tables (tasks, specs, notes, links, ...)
                          └─► events  ──► activity, Today, replicas
```

- **Task model** (`src/lib/domain/task-model.ts`): status is the only input to progress; a parent averages
  its subtasks; a spec's progress is the share of its tasks that are done. `updateTask` refreshes the old
  and new spec and the parent chain in the same transaction.
- **Promote**: a note becomes a task, spec or doc with a `relates` link back to the note.
- **Trash**: deletes are soft, restorable from the trash, and replicas treat them as deletions.

## Replicas: the vault mirror (0.3)

One engine (`src/lib/vault/engine.ts`, planned by `plan.ts`, run through `runner.ts` under `runExclusive`)
keeps notes, docs, specs and tasks as markdown files. It reconciles per adapter (upsert, never replace-all):

- an app change writes the file; an unchanged file of a deleted entity moves to `.masarflow-trash/`;
- a file edit imports when auto-import is on, otherwise it is recorded as `pending-import`;
- edits on both sides, or an edited file of a deleted entity, raise a conflict the user answers;
- untracked files are adopted only when the user asks (Import untracked).

## One AI runtime (0.3)

Chat, AI agents and AI workflow all call `runAgentTurn` (`src/lib/ai/turn/run-agent-turn.ts`): context
assembly, a prompt budget, provider streaming, tool calls through coarse toolsets (`toolsets.ts`), and
approval for writes through one `ApprovalCard`. Writes made by the AI are commands with actor `ai`, so they
show in the feed and undo like any other change. Agent steps are pruned by retention
(`src/lib/db/retention.ts`); chat messages are only removed by Clear thread history.

## Data

IndexedDB (Dexie, schema version 15) is the system of record; safety comes from automatic rolling backups
and the user-visible markdown mirror:

- `%APPDATA%\\MasarFlow\\` — `logs/`, `backups/`, `secrets.json` (encrypted), `roots.json`.
- **Backups** — format version 1, data version 3. One invalid row refuses the whole file, so a restore never
  half-applies. `pnpm doctor:data` checks a profile for dangling links, orphans and drift.
- **Embeddings** — `@huggingface/transformers` (ONNX/WASM) in a Web Worker; vectors in Dexie; brute-force
  cosine search. No Python, no external service.

## Security model (D4)

1. The server binds `127.0.0.1` only; every request must carry the per-launch token (the renderer never
   sees it — the main process injects it into the `masarflow://app` proxy).
2. `Host` must be the loopback address (anti DNS-rebinding); any `Origin` must be `masarflow://app`
   (anti CSRF).
3. Filesystem and shell routes only accept paths inside folders the user picked with the native folder
   picker; the allow-list is `%APPDATA%\MasarFlow\roots.json`, written by the main process only.
4. Electron hardening: sandbox, context isolation, no `nodeIntegration`, CSP, navigation lock, permission
   handler; webviews disabled.
5. Secrets (AI keys, GitHub PAT, Obsidian key) live in `secrets.json` encrypted via the OS credential store
   (`safeStorage`); only presence is ever displayed.
6. Diagnostics are redacted: no keys or tokens, `%USERPROFILE%` instead of the home directory, and
   `<redacted-path>` for everything outside linked folders.

Verification: `pnpm security:check` (black-box guard check) and the packaged smoke (`pnpm smoke:desktop`).

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Styling | Tailwind CSS v4 · shadcn/ui primitives |
| State & storage | Dexie (IndexedDB) · Zustand · Zod |
| Editor & viz | CodeMirror 6 · @xyflow/react · d3-force · mermaid |
| AI | Native providers (models.dev catalog) · Ollama · custom OpenAI-compatible endpoints · workspace tools |
| Embeddings | @huggingface/transformers (ONNX/WASM) in a Web Worker |
| Desktop | Electron 43 · electron-vite · electron-builder (NSIS + portable) · electron-updater |
| Terminal | xterm.js + node-pty |
| Tests | Vitest · Playwright (browser + packaged Electron) |

## Repository layout

```
src/
  app/            App Router: (workspace) routes + /api routes
  components/     Feature components per module + ui/ primitives
  lib/
    ai/           providers, runAgentTurn, toolsets, context engine, undo
    db/           Dexie schema, models, repos, backups, retention, demo seed
    domain/       commands, events, task model (the one write path)
    navigation/   the six surfaces and their sections
    vault/        mirror engine, frontmatter, daily notes, quick switch
    entities/     EntityRef registry + openEntity
  ...
desktop/
  src/main/       Electron main: backend server, protocol, security, ipc
  src/preload/    typed contextIsolated bridge (window.masarflow)
  src/shared/     cross-process types (channels, settings, versions)
tests/
  unit/           Vitest (mirrors src/)
  e2e/            Playwright browser specs
  e2e/desktop/    packaged-app specs (pnpm e2e:desktop)
scripts/          build, smoke, security-check, release helpers
.github/          CI + release workflows
```
