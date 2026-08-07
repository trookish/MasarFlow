"""Paragraph-aware text chunking with overlap, for RAG retrieval.

Pure functions — no I/O, easy to unit test in isolation from FastAPI/Chroma.
"""

from __future__ import annotations

DEFAULT_CHUNK_SIZE = 1000
DEFAULT_OVERLAP = 150


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[str]:
    """Split text into overlap-windowed chunks without breaking paragraphs.

    Paragraphs (blank-line separated) are packed greedily into windows up to
    ``chunk_size``. A single paragraph longer than ``chunk_size`` is hard-split
    by character offset. Consecutive chunks share the last ``overlap``
    characters of their predecessor so a fact split across a boundary is still
    retrievable from at least one chunk.
    """
    text = text.strip()
    if not text:
        return []

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()] or [text]

    packed: list[str] = []
    current = ""
    for para in paragraphs:
        if len(para) > chunk_size:
            if current:
                packed.append(current)
                current = ""
            packed.extend(_hard_split(para, chunk_size, overlap))
            continue
        candidate = f"{current}\n\n{para}" if current else para
        if len(candidate) > chunk_size:
            packed.append(current)
            current = para
        else:
            current = candidate
    if current:
        packed.append(current)

    if len(packed) <= 1:
        return packed

    overlapped = [packed[0]]
    for chunk in packed[1:]:
        prev = overlapped[-1]
        tail = prev[-overlap:] if overlap and len(prev) > overlap else prev
        overlapped.append(f"{tail}\n\n{chunk}" if tail else chunk)
    return overlapped


def _hard_split(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Split a single oversized paragraph by character offset, with overlap."""
    pieces: list[str] = []
    step = max(chunk_size - overlap, 1)
    start = 0
    while start < len(text):
        pieces.append(text[start : start + chunk_size])
        start += step
    return pieces
