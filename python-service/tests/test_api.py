import asyncio

from fastapi.testclient import TestClient
from app.main import app

from app.job_queue import SyncItem, SyncJob, process_job

PROJECT = "proj-1"


def test_health_has_expected_shape():
    with TestClient(app) as client:
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "available" in data["ollama"]


def test_embeddings_sync_enqueues_and_returns_202():
    # A dedicated project id — this test exercises the real async queue
    # (unlike the others, which seed via process_job() directly), so it must
    # not share a project id with tests that assert exact search/RAG results.
    with TestClient(app) as client:
        res = client.post(
            "/embeddings/sync",
            json={
                "projectId": "proj-enqueue-only",
                "items": [{"id": "n1", "kind": "note", "title": "Hello", "body": "World"}],
            },
        )
        assert res.status_code == 202
        data = res.json()
        assert data["ok"] is True
        assert data["enqueued"] == 1


def _seed(items: list[SyncItem]) -> None:
    """Bypass the async queue and embed synchronously, so search/RAG tests
    aren't racing the background worker_loop's scheduling."""
    asyncio.run(process_job(SyncJob(project_id=PROJECT, items=items)))


def test_search_semantic_finds_a_seeded_note_and_dedupes_by_entity():
    _seed(
        [
            SyncItem(
                id="note-auth",
                kind="note",
                title="Authentication design",
                body="We use JWT access tokens with a refresh token rotation scheme "
                "to keep the login flow secure.",
            ),
            SyncItem(
                id="note-cooking",
                kind="note",
                title="Weekend recipe",
                body="A simple pasta with garlic, olive oil, and chili flakes.",
            ),
        ]
    )
    with TestClient(app) as client:
        res = client.post(
            "/search/semantic",
            json={"projectId": PROJECT, "query": "how does login and JWT work", "limit": 5},
        )
        assert res.status_code == 200
        results = res.json()["results"]
        assert len(results) >= 1
        assert results[0]["id"] == "note-auth"
        # One result per entity, even though "note-auth" was chunked.
        ids = [r["id"] for r in results]
        assert len(ids) == len(set(ids))


def test_rag_query_returns_chunks_scoped_to_note_and_doc_kinds():
    _seed(
        [
            SyncItem(
                id="note-deploy",
                kind="note",
                title="Deployment runbook",
                body="To deploy the service, build the container image and push it to the "
                "registry, then roll out the new revision.",
            ),
            SyncItem(
                id="task-deploy",
                kind="task",
                title="Deploy the service",
                body="Follow the deployment runbook.",
            ),
        ]
    )
    with TestClient(app) as client:
        res = client.post(
            "/rag/query",
            json={"projectId": PROJECT, "query": "how do I deploy", "topK": 5},
        )
        assert res.status_code == 200
        chunks = res.json()["chunks"]
        assert len(chunks) >= 1
        # Default kinds filter is ["note", "doc"] — the task must be excluded.
        assert all(c["kind"] in ("note", "doc") for c in chunks)
        assert any(c["entityId"] == "note-deploy" for c in chunks)


def test_embeddings_sync_reconciles_deletions_via_all_ids():
    _seed(
        [
            SyncItem(id="keep-me", kind="note", title="Keep", body="Keep this one around."),
            SyncItem(id="drop-me", kind="note", title="Drop", body="This one should disappear."),
        ]
    )
    # Only "keep-me" is in allIds now — "drop-me" must be reconciled away.
    asyncio.run(
        process_job(
            SyncJob(
                project_id=PROJECT,
                items=[],
                all_ids={"keep-me"},
            )
        )
    )
    with TestClient(app) as client:
        res = client.post(
            "/search/semantic",
            json={"projectId": PROJECT, "query": "keep or drop", "limit": 10},
        )
        ids = [r["id"] for r in res.json()["results"]]
        assert "keep-me" in ids
        assert "drop-me" not in ids
