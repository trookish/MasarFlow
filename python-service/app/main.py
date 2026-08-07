"""MasarFlow local AI service.

Embeddings, semantic search, and RAG retrieval for the Next.js app. Talked to
only from Next.js server-side API routes (src/app/api/python/*), never
directly from the browser — so this stays a plain local HTTP service with no
auth and no CORS handling needed. Entirely optional: the app degrades to
Fuse-based search and full-snapshot chat context when this isn't running.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from pydantic import BaseModel
from app.embeddings import embed, get_collection

from app.job_queue import SyncItem, SyncJob, enqueue, pending_count, worker_loop

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("masarflow.main")

OLLAMA_URL = "http://localhost:11434"


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(worker_loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="MasarFlow Local AI Service", lifespan=lifespan)


@app.get("/health")
async def health():
    ollama_available = False
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            res = await client.get(f"{OLLAMA_URL}/api/tags")
            ollama_available = res.status_code == 200
    except Exception:
        ollama_available = False
    return {"status": "ok", "ollama": {"available": ollama_available}}


class SyncItemIn(BaseModel):
    id: str
    kind: str
    title: str = ""
    subtitle: str = ""
    body: str = ""


class SyncRequest(BaseModel):
    projectId: str
    # Items that need (re-)embedding — may be a subset of everything live if
    # the caller already knows the rest are unchanged.
    items: list[SyncItemIn]
    # Full current id set for the project, for stale-vector reconciliation.
    # Defaults to `items`' own ids when omitted (i.e. `items` is everything).
    allIds: list[str] | None = None


@app.post("/embeddings/sync", status_code=202)
async def embeddings_sync(req: SyncRequest):
    items = [SyncItem(**i.model_dump()) for i in req.items]
    all_ids = set(req.allIds) if req.allIds is not None else None
    enqueue(SyncJob(project_id=req.projectId, items=items, all_ids=all_ids))
    return {"ok": True, "enqueued": len(items)}


@app.get("/embeddings/status")
async def embeddings_status(projectId: str):
    return {"projectId": projectId, "pending": pending_count(projectId)}


class SearchRequest(BaseModel):
    projectId: str
    query: str
    kinds: list[str] | None = None
    limit: int = 10


@app.post("/search/semantic")
async def search_semantic(req: SearchRequest):
    collection = get_collection()
    [vector] = embed([req.query])
    where: dict = (
        {"$and": [{"projectId": req.projectId}, {"kind": {"$in": req.kinds}}]}
        if req.kinds
        else {"projectId": req.projectId}
    )
    # Over-fetch, then dedupe to one best-scoring result per source entity.
    results = collection.query(
        query_embeddings=[vector],
        n_results=max(req.limit * 3, req.limit),
        where=where,
    )
    ids = results.get("ids", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    documents = results.get("documents", [[]])[0]
    distances = results.get("distances", [[]])[0]

    seen: set[str] = set()
    out = []
    for _id, meta, doc, dist in zip(ids, metadatas, documents, distances):
        entity_id = meta.get("entityId")
        if not entity_id or entity_id in seen:
            continue
        seen.add(entity_id)
        out.append(
            {
                "id": entity_id,
                "kind": meta.get("kind"),
                "title": meta.get("title"),
                "score": 1 - dist,
                "snippet": doc[:200],
            }
        )
        if len(out) >= req.limit:
            break
    return {"results": out}


class RagRequest(BaseModel):
    projectId: str
    query: str
    topK: int = 8
    budgetChars: int = 12000
    kinds: list[str] = ["note", "doc"]


@app.post("/rag/query")
async def rag_query(req: RagRequest):
    collection = get_collection()
    [vector] = embed([req.query])
    where = {"$and": [{"projectId": req.projectId}, {"kind": {"$in": req.kinds}}]}
    results = collection.query(query_embeddings=[vector], n_results=req.topK, where=where)

    metadatas = results.get("metadatas", [[]])[0]
    documents = results.get("documents", [[]])[0]
    distances = results.get("distances", [[]])[0]

    chunks = []
    used = 0
    for meta, doc, dist in zip(metadatas, documents, distances):
        if used + len(doc) > req.budgetChars:
            continue
        chunks.append(
            {
                "entityId": meta.get("entityId"),
                "kind": meta.get("kind"),
                "title": meta.get("title"),
                "text": doc,
                "score": 1 - dist,
            }
        )
        used += len(doc)
    return {"chunks": chunks}
