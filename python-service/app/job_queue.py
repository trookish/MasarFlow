"""In-process async worker queue for background jobs.

A single asyncio.Queue consumed by one background task, not Celery/Redis.
MasarFlow is single-user, local-scale — enough to keep heavy work (embedding,
code analysis, graph recompute, parsing, git intel) off the request path
without adding infrastructure.

Jobs are plain dataclasses; each kind has a registered async handler. The
embedding handler (``process_job``) is the only fully-implemented one today;
the others (analysis/graph/parse/git) are registered as their modules land.
Unregistered kinds log and are dropped so a bad enqueue never kills the
worker.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable
from app.chunking import chunk_text

from app.embeddings import embed, get_collection

logger = logging.getLogger("masarflow.queue")

# Kinds whose bodies are long enough to benefit from paragraph chunking.
# Everything else (task/spec/standard/system/memory/devlog titles+snippets)
# is short and indexed as a single chunk — still searchable, just not diced.
CHUNKABLE_KINDS = {"note", "doc"}
SHORT_KIND_CLIP = 2000


@dataclass
class SyncItem:
    id: str
    kind: str
    title: str = ""
    subtitle: str = ""
    body: str = ""


@dataclass
class SyncJob:
    project_id: str
    items: list[SyncItem] = field(default_factory=list)
    # Full current id set for this project, used for stale-vector deletion.
    # `items` may be a smaller "only what changed" subset for efficiency —
    # `all_ids` must still reflect everything currently live so unchanged
    # entities aren't mistaken for deleted ones. Defaults to items' own ids
    # when not given (i.e. `items` IS the full set).
    all_ids: set[str] | None = None


@dataclass
class AnalysisJob:
    """Background code analysis of one watched/changed source file. Handler
    is registered by ``code_analysis`` when that module lands; until then the
    worker logs and drops it."""
    project_id: str
    path: str
    content: str
    language: str = ""


@dataclass
class GraphJob:
    """Recompute graph analysis (communities/centrality/link prediction) for a
    project after its links change."""
    project_id: str


@dataclass
class ParseJob:
    """Background parse of a binary file (PDF/Office/image/audio) into text
    that the embedding pipeline can index. Handler registered by ``parsers``."""
    project_id: str
    path: str
    modality: str  # "pdf" | "office" | "image" | "audio"
    content_b64: str = ""


@dataclass
class GitJob:
    """Background semantic analysis of one commit (classification + summary +
    link suggestions) to populate ``Commit.aiSummary``. Handler registered by
    ``git_intel``."""
    project_id: str
    sha: str
    message: str
    diff: str = ""


# Union of every backgroundable job kind. The queue holds these; the worker
# dispatches by concrete type via the handler registry below.
Job = SyncJob | AnalysisJob | GraphJob | ParseJob | GitJob

Handler = Callable[[Any], Awaitable[None]]

_handlers: dict[type, Handler] = {}


def register_handler(job_type: type, handler: Handler) -> None:
    """Register an async handler for a job dataclass type. Called by each
    feature module at import time so the worker can dispatch its jobs."""
    _handlers[job_type] = handler


_queue: "asyncio.Queue[Job]" = asyncio.Queue()
# Per-project count of *pending embedding items* (SyncJob.items only). Other
# job kinds don't carry an item count; they're tracked implicitly by the
# queue. Kept for the /embeddings/status endpoint's semantics.
_pending: dict[str, int] = {}


def enqueue(job: Job) -> None:
    if isinstance(job, SyncJob):
        _pending[job.project_id] = _pending.get(job.project_id, 0) + len(job.items)
    _queue.put_nowait(job)


def pending_count(project_id: str) -> int:
    return _pending.get(project_id, 0)


def _where_entity(project_id: str, entity_id: str) -> dict:
    return {"$and": [{"projectId": project_id}, {"entityId": entity_id}]}


async def process_job(job: SyncJob) -> None:
    """Embed + upsert every item, then delete any vectors for entities that
    are no longer present in the given item set (full-replace-by-project)."""
    collection = get_collection()
    current_ids = job.all_ids if job.all_ids is not None else {item.id for item in job.items}

    existing = collection.get(where={"projectId": job.project_id})
    stale_ids = [
        cid
        for cid, meta in zip(existing.get("ids", []), existing.get("metadatas", []))
        if meta.get("entityId") not in current_ids
    ]
    if stale_ids:
        collection.delete(ids=stale_ids)

    for item in job.items:
        # Replace this entity's existing chunks outright — simpler than
        # diffing individual chunk changes, and cheap at local-app scale.
        collection.delete(where=_where_entity(job.project_id, item.id))

        text = "\n".join(p for p in (item.title, item.subtitle, item.body) if p).strip()
        if not text:
            continue
        chunks = (
            chunk_text(text) if item.kind in CHUNKABLE_KINDS else [text[:SHORT_KIND_CLIP]]
        )
        if not chunks:
            continue

        vectors = embed(chunks)
        ids = [f"{item.id}::{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "projectId": job.project_id,
                "entityId": item.id,
                "kind": item.kind,
                "title": item.title,
                "chunkIndex": i,
            }
            for i in range(len(chunks))
        ]
        collection.upsert(ids=ids, embeddings=vectors, documents=chunks, metadatas=metadatas)


# Embedding jobs are handled as soon as this module imports — the original
# Phase 1 behavior, preserved so main.py and the existing tests keep working.
register_handler(SyncJob, process_job)


async def worker_loop() -> None:
    """Runs forever, processing jobs one at a time; started from main.py's
    FastAPI lifespan hook. Dispatches each job to its registered handler; an
    unregistered kind is logged and dropped so the worker never dies."""
    while True:
        job = await _queue.get()
        try:
            handler = _handlers.get(type(job))
            if handler is None:
                logger.warning(
                    "no handler registered for %s — dropping",
                    type(job).__name__,
                )
            else:
                await handler(job)
        except Exception:  # noqa: BLE001 — log and keep the worker alive
            logger.exception("job failed: %s", type(job).__name__)
        finally:
            if isinstance(job, SyncJob):
                _pending[job.project_id] = max(
                    0, _pending.get(job.project_id, 0) - len(job.items)
                )
            _queue.task_done()
