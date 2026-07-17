"""Embedding model + persistent vector store.

A single Chroma collection holds chunks for every project, keyed by the
`projectId` metadata field — simpler to reconcile than one collection per
project (see job_queue.py's full-replace-by-project sync).
"""

from __future__ import annotations

import os
from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
STORE_DIR = Path(__file__).parent / "store" / "chroma"
COLLECTION_NAME = "masarflow"

_model: SentenceTransformer | None = None
_collection = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def get_collection(store_dir: Path | None = None):
    """Returns the shared Chroma collection, creating it (cosine space) on
    first use. `store_dir` (or the module-level STORE_DIR) is overridable so
    tests can point at a temp dir — resolved at call time, not import time."""
    global _collection
    if _collection is None:
        resolved = store_dir or STORE_DIR
        resolved.mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(path=str(resolved))
        _collection = client.get_or_create_collection(
            COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
        )
    return _collection


def reset_collection_cache() -> None:
    """Test-only: force get_collection() to reopen against a fresh path."""
    global _collection
    _collection = None


def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = get_model()
    return model.encode(texts, normalize_embeddings=True).tolist()
