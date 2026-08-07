import pytest

from app import embeddings


@pytest.fixture(autouse=True)
def isolated_chroma_store(tmp_path, monkeypatch):
    """Every test gets its own throwaway Chroma directory so runs don't
    pollute (or depend on) the real store/chroma/ used by `uvicorn app.main:app`."""
    monkeypatch.setattr(embeddings, "STORE_DIR", tmp_path / "chroma")
    embeddings.reset_collection_cache()
    yield
    embeddings.reset_collection_cache()
