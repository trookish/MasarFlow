# MasarFlow

Local-first, AI-native project workspace. Everything lives in your browser's
IndexedDB — notes, tasks, specs, canvases, chat threads — with a local Python
sidecar providing embeddings, semantic search, and RAG context. No account, no
cloud, no telemetry.

## Features

- **Dashboard** — project metrics, activity, and GitHub commit feed.
- **Brain** — markdown notes with wikilinks, backlinks, templates, slash
  commands, and a live-rendered CodeMirror editor.
- **Canvas** — infinite board (text, note, media, web-embed, group nodes) with
  Obsidian `.canvas` import/export and AI-operable tools.
- **Knowledge graph** — d3-force visualization of note/entity links.
- **Chat** — multi-provider (OpenAI/Anthropic/Ollama) streaming chat with
  `@`/`/`/`#` mentions, tool-calling over your workspace, image attachments,
  and voice input. API keys stay in localStorage and are only sent to the
  same-origin proxy route.
- **Agents & Workflow** — agent roster with run inspector, and a 16-step
  agentic pipeline runner.
- **Tasks, Sprints, Specs, Standards** — kanban board, sprint velocity, spec
  editor, and a regex-based standards enforcer.
- **Sync** — two-way Obsidian vault sync; **Watcher** — live filesystem event
  feed (SSE); **Files** — synced-file index.
- **Search** — global Fuse search plus vector semantic search via the Python
  service.
- **Plugins** — catalog with toggles, settings, and widget slots.

## Stack

Next.js 16 (App Router, webpack dev) · React 19 · TypeScript · Tailwind CSS v4
· Dexie (IndexedDB) + Zustand · @xyflow/react · CodeMirror 6 · d3 · FastAPI +
sentence-transformers + Chroma (Python sidecar)

## Requirements

- Node.js 20+
- Python 3.11+ on PATH (for the local AI service)

## Quick start

```bash
npm install
npm run setup:python   # creates python-service/.venv and installs deps
npm run dev:full       # Next.js dev server + Python service together
```

Open http://localhost:3000. The workspace shell waits until the Python
service is healthy; `dev:full` starts it automatically (first run downloads
the ~90MB `all-MiniLM-L6-v2` embedding model).

Production mode:

```bash
npm run build
npm start              # launches next start + uvicorn, Python-required
```

## Environment

Copy `.env.local.example` to `.env.local`. The only variable is
`PYTHON_SERVICE_URL` (default `http://127.0.0.1:8000`) — change it only if
you run the service on a different port. The service is loopback-only.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server (webpack) |
| `npm run dev:full` | Dev server + Python service, side by side |
| `npm run build` / `npm start` | Production build / launcher (Next + Python) |
| `npm run setup:python` | Create the Python venv and install requirements |
| `npm run lint` | ESLint (flat config, Next core-web-vitals + TS) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` / `format:check` | Prettier write / check |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run e2e` | Playwright smoke tests (run `npm run build` first) |
| `pytest` (in `python-service/`) | Python service tests |

## Project structure

```
src/
  app/            App Router: (workspace) routes + /api proxy routes
  components/     Feature components per module + ui/ primitives
  lib/
    ai/           Chat client (NDJSON stream), tools, context, catalog
    chat/         Mention engine + resolvers
    db/           Dexie schema, Zod models, 27 repos, demo seed
    hooks/        React hooks (speech, python health, hotkeys, ...)
    stores/       Zustand stores (persisted UI state)
    utils/        cn, ids, markdown, Fuse search
python-service/   FastAPI sidecar: embeddings, semantic search, RAG
scripts/          start.mjs production launcher
e2e/              Playwright specs
```

## Architecture notes

- **Local-first**: all workspace data is in IndexedDB (Dexie, ~30 tables,
  repository pattern). Reset or seed demo data from Settings → Data.
- **AI layer**: hand-rolled NDJSON streaming proxy at `api/chat` (OpenAI +
  Anthropic wire formats) driving an agentic tool loop over workspace repos.
- **Python sidecar**: reached only from server-side routes under
  `api/python/*` (loopback-enforced, graceful degradation). Roadmap for its
  Phase-2 modules lives in `PYTHON_INTEGRATION_ANALYSIS.md`.
- **Integrations**: GitHub (Octokit, PAT server-side only), Obsidian Local
  REST API, Ollama model listing, filesystem watcher over SSE.
