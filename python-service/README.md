# MasarFlow local AI service

Optional. Provides embeddings, semantic search, and RAG context retrieval to
the Next.js app via `src/app/api/python/*` proxy routes. If this isn't
running, the app falls back to Fuse-based search and full-snapshot chat
context — nothing breaks.

## Setup

```
cd python-service
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements-dev.txt
```

The first request that needs embeddings downloads the `all-MiniLM-L6-v2`
sentence-transformers model (~90MB) and caches it locally.

## Run

```
uvicorn main:app --reload --port 8000
```

Or, from the repo root, run both Next.js and this service together:

```
npm run dev:full
```

Set `PYTHON_SERVICE_URL` in `.env.local` (see `.env.local.example` at the repo
root) if you run this service on a different port.

## Test

```
pip install -r requirements-dev.txt
pytest
```

## Endpoints

- `GET /health` — service + Ollama reachability.
- `POST /embeddings/sync` — `{projectId, items[]}`, full-replace-by-project.
  Enqueues embedding work on an in-process asyncio queue; returns `202`
  immediately.
- `GET /embeddings/status?projectId=` — pending job count for that project.
- `POST /search/semantic` — `{projectId, query, kinds?, limit}`.
- `POST /rag/query` — `{projectId, query, topK, budgetChars, kinds}`.

Data is persisted to `store/chroma/` (gitignored) — delete that directory to
reset the index.
