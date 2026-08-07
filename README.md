# MasarFlow

**A local-first, AI-native project workspace.** Everything lives in your browser — notes, tasks, specs, canvases, and chat threads — backed by a local Python sidecar for embeddings, semantic search, and RAG context. No account. No cloud. No telemetry.

![Next.js](https://img.shields.io/badge/Next.js%2016-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React%2019-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS%20v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python%203.11+-3776AB?style=flat-square&logo=python&logoColor=white)

---

## Table of contents

- [Features](#features)
- [Why local-first](#why-local-first)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Testing](#testing)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Security](#security)

---

## Features

### Knowledge & documentation

- **Brain** — Markdown notes with wikilinks, backlinks, templates, slash commands, and a live-rendered CodeMirror editor.
- **Canvas** — infinite board with text, note, media, web-embed, and group nodes; Obsidian `.canvas` import/export; AI-operable tools.
- **Knowledge graph** — d3-force visualization of notes, entities, and their links.
- **Docs & Dev Logs** — documentation hub with PDF export and a chronological activity timeline.

### Planning & delivery

- **Tasks / Sprints / Specs / Standards** — kanban board, sprint velocity tracking, spec editor, and a regex-based standards enforcer.
- **Agents & Workflow** — agent roster with run inspector and a 16-step agentic pipeline runner.
- **Dashboard** — project health metrics, activity, and a GitHub commit feed.

### AI assistant

- **Chat** — multi-provider streaming chat (OpenAI, Anthropic, OpenRouter, Groq, Ollama, ...) with `@`/`/`/`#` mentions, tool-calling over your workspace, image attachments, and voice input. Two modes:
  - **Agentic** — grounded in the live workspace, acts via tools.
  - **Chat** — direct conversation, no context injection.
- **Linked projects (agentic coding)** — attach an external folder (e.g., a game engine project) and the AI gets sandboxed filesystem/shell tools on it, opencode-style: `fs_list`, `fs_read`, `fs_search` run freely; `fs_write` and `shell_run` require per-action approval.
- **Semantic search** — global Fuse fuzzy search plus vector similarity search through the Python service.

### Integrations

- **Sync** — two-way Obsidian vault sync.
- **Watcher** — live filesystem event feed over SSE.
- **Files** — synced-file index.
- **GitHub** — commit feed and spec extraction (PAT used server-side only).
- **Plugins** — catalog with toggles, settings, and widget slots.

## Why local-first

- **Your data stays yours.** All workspace data lives in IndexedDB (Dexie) in your browser — no servers, no accounts, no telemetry.
- **API keys never leave your machine.** Keys are stored in `localStorage` and sent only to the same-origin proxy route.
- **Works offline.** The UI is fully functional without network access; only model calls require connectivity.

## Architecture

```
┌──────────────────────────── Browser ────────────────────────────┐
│                                                                │
│  React UI (src/components) ── Zustand stores ── Dexie (IndexedDB)│
│        │                              ▲                        │
│        │ /api/chat proxy (NDJSON)     │ repos                  │
│        ▼                              │                        │
│  Next.js server (src/app) ────────────┘                        │
│     │                 │                                        │
│     │ /api/python/*   │ /api/fs/* (sandboxed)                  │
└─────┼─────────────────┼────────────────────────────────────────┘
      ▼                 ▼
┌─────────────────┐  ┌───────────────────────────────────────────┐
│ Python sidecar  │  │ Linked external projects                   │
│ FastAPI +       │  │ path-sandboxed fs_read/fs_write + shell    │
│ sentence-       │  │ per-action user approval                   │
│ transformers +  │  └───────────────────────────────────────────┘
│ Chroma          │
└─────────────────┘
```

The AI layer is a hand-rolled NDJSON streaming proxy at `api/chat` (OpenAI + Anthropic wire formats, explicit `tool_choice`, degradation ladder) driving an agentic tool loop over the workspace repos and linked external projects.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Styling | Tailwind CSS v4 · shadcn/ui |
| State & storage | Dexie (IndexedDB) · Zustand · Zod |
| Editor & viz | CodeMirror 6 · @xyflow/react (canvas) · d3-force (graph) · mermaid |
| AI | Streaming proxy with multi-provider support (OpenAI, Anthropic, OpenRouter, Groq, Ollama) |
| Python sidecar | FastAPI · sentence-transformers · Chroma DB · uvicorn |
| Testing | Vitest · Playwright · pytest |

## Getting started

### Requirements

- **Node.js 20+**
- **Python 3.11+** on PATH (for the local AI service)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Create the Python virtual environment and install requirements
npm run setup:python

# 3. Configure the environment
cp .env.local.example .env.local
```

### Development

```bash
npm run dev:full   # Next.js dev server + Python service side by side
```

Open http://localhost:3000. The workspace shell waits until the Python service is healthy before loading; `dev:full` starts it automatically (the first embedding request downloads the ~90 MB `all-MiniLM-L6-v2` model).

### Production

```bash
npm run build
npm start   # launches `next start` + uvicorn
```

## Configuration

The only environment variable is `PYTHON_SERVICE_URL`, copied from `.env.local.example`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PYTHON_SERVICE_URL` | `http://127.0.0.1:8000` | Base URL of the local Python AI service. Change only if you run it on a different port. |

The service binds to loopback only.

## Testing

```bash
npm run lint        # ESLint (Next.js + TypeScript rules)
npm run typecheck   # tsc --noEmit
npm test            # Vitest unit tests (tests/unit/)
npm run e2e         # Playwright end-to-end (run `npm run build` first)
cd python-service && .venv/Scripts/python -m pytest   # Python service tests
```

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
| `npm test` | Vitest unit tests (`tests/unit/**/*.test.ts`) |
| `npm run e2e` | Playwright smoke tests |
| `pytest` (in `python-service/`) | Python service tests |

## Project structure

```
src/
  app/            App Router: (workspace) routes + /api proxy routes
  components/     Feature components per module + ui/ primitives
  lib/
    ai/           Chat client (NDJSON stream), tools (workspace + fs/shell),
                  context, catalog, connection probe
    chat/         Mention engine + resolvers
    db/           Dexie schema, Zod models, 28 repos, demo seed
    hooks/        React hooks (speech, python health, hotkeys, ...)
    stores/       Zustand stores (persisted UI state)
    utils/        cn, ids, markdown, Fuse search
tests/
  unit/           Vitest unit tests (mirrors src/ layout)
  e2e/            Playwright specs
  vitest.config.ts / playwright.config.ts
python-service/   FastAPI sidecar: app/ package, requirements/, tests
scripts/          start.mjs production launcher
```

## Security

- **Local-first data** — all workspace data stays in the browser's IndexedDB; no data leaves your machine except the model requests you initiate.
- **Sandboxed AI tooling** — filesystem and shell routes under `api/fs/*` validate paths server-side, deny traversal and secret files (`.env`, keys), and require per-action approval for `fs_write` and `shell_run` in the chat UI. "Always allow" is session-scoped only.
- **API keys** — stored in `localStorage`, sent only to the same-origin proxy route; never exposed to the client of a third-party.
- **Python sidecar** — reachable only from server-side routes under `api/python/*`, loopback-bound, with graceful degradation when unavailable.
