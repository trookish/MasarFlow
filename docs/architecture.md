# Architecture

The shape of MasarFlow 0.2, for contributors. Decisions referenced as D1–D12 / Q3 live in the master plan
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
│ Dexie ── hooks ──► activity log           │
│ Embeddings Web Worker (transformers.js)   │
│ Chat ── context engine ── workspace tools │
└───────────────────────────────────────────┘
```

## Data (D6)

IndexedDB stays the system of record in 0.2; safety comes from automatic rolling backups and a
user-visible markdown mirror:

- `%APPDATA%\MasarFlow\` — `logs/`, `backups/`, `secrets.json` (encrypted), `roots.json`.
- **Vault mirror** — notes, docs, specs and tasks exist as plain files (frontmatter = properties) that
  Obsidian, VS Code and git can open.
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
    ai/           providers, agent loop, context engine, workspace tools
    db/           Dexie schema, models, repos, backups, demo seed
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
