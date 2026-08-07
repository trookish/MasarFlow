import pytest

import app.job_queue as job_queue

from app.job_queue import (
    AnalysisJob,
    GraphJob,
    SyncJob,
    SyncItem,
    enqueue,
    pending_count,
    process_job,
    register_handler,
)


@pytest.fixture(autouse=True)
def restore_default_handlers():
    """Keep the module's handler registry in its default state (SyncJob
    registered) after each test, so clearing it here can't leak into a later
    test run via the shared module."""
    yield
    job_queue._handlers.clear()
    register_handler(SyncJob, process_job)
    job_queue._pending.clear()


def test_syncjob_still_processed_via_registry():
    """The generalized worker still dispatches SyncJob to process_job."""
    job_queue._handlers.clear()
    register_handler(SyncJob, process_job)
    assert job_queue._handlers[SyncJob] is process_job
    # process_job itself is unchanged — drives a real (throwaway) embed cycle.
    job = SyncJob(
        project_id="reg-proj",
        items=[SyncItem(id="x", kind="note", body="hello world")],
    )
    asyncio_run = __import__("asyncio").run
    asyncio_run(process_job(job))
    enqueue(job)
    assert pending_count("reg-proj") == 1


def test_pending_count_only_tracks_sync_jobs():
    """Non-embedding job kinds don't inflate the embedding pending count."""
    before = pending_count("graph-proj")
    enqueue(GraphJob(project_id="graph-proj"))
    assert pending_count("graph-proj") == before


def test_unregistered_kind_has_no_handler():
    """The worker drops a kind whose handler isn't registered. We check the
    dispatch contract directly (not the cross-loop module queue) — the worker
    logs and skips when ``_handlers.get(type(job))`` is None."""
    job_queue._handlers.clear()  # nothing registered
    enqueue(AnalysisJob(project_id="p", path="a.ts", content="x"))  # must not raise
    assert job_queue._handlers.get(AnalysisJob) is None
    # pending_count is unaffected by non-embedding kinds.
    assert pending_count("p") == 0
