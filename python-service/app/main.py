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
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from app.embeddings import MODEL_NAME, embed, get_collection

from app.job_queue import SyncItem, SyncJob, enqueue, pending_count, worker_loop

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("masarflow.main")

OLLAMA_URL = "http://localhost:11434"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("worker loop started (pid %s)", __import__("os").getpid())
    task = asyncio.create_task(worker_loop())
    try:
        yield
    finally:
        task.cancel()
        logger.info("service shutting down")


app = FastAPI(title="MasarFlow Local AI Service", lifespan=lifespan)


@app.get("/")
async def root():
    # The service is intentionally not browsable; this route exists so that
    # liveness probes (and humans) hitting the base URL get a useful answer
    # instead of a 404 in the access log.
    return {
        "service": "MasarFlow Local AI Service",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    ollama_available = False
    try:
        # Fast connect-timeout so a dead Ollama never slows the health check
        # the web shell polls on every page load (it must answer in ms).
        timeout = httpx.Timeout(connect=0.5, read=1.0, write=1.0, pool=1.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.get(f"{OLLAMA_URL}/api/tags")
            ollama_available = res.status_code == 200
    except Exception:
        ollama_available = False
    return {"status": "ok", "ollama": {"available": ollama_available}}


def _warm_embeddings() -> None:
    # Loading the sentence-transformer model on first use can take 10-60s
    # (download on first run), and Chroma opens lazily too — so the readiness
    # check warms both and verifies the full embed pipeline. Runs in a worker
    # thread so the event loop never blocks; a client that abandons the probe
    # still gets a warm service for the next one.
    embed(["masarflow readiness check"])


@app.get("/ready")
async def ready():
    try:
        await asyncio.to_thread(_warm_embeddings)
    except Exception as e:
        logger.error("readiness check failed: %s", e)
        return JSONResponse(status_code=503, content={"ready": False, "error": str(e)})
    return {"ready": True, "model": MODEL_NAME}


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
