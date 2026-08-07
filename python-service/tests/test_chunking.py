from app.chunking import chunk_text


def test_empty_text_returns_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_short_text_is_a_single_chunk():
    text = "Just a short note about the login flow."
    assert chunk_text(text, chunk_size=1000) == [text]


def test_multi_paragraph_text_stays_packed_until_the_budget_is_hit():
    paragraphs = [f"Paragraph {i}. " + ("word " * 20) for i in range(6)]
    text = "\n\n".join(paragraphs)
    chunks = chunk_text(text, chunk_size=200, overlap=20)
    assert len(chunks) > 1
    # Every paragraph's distinctive marker shows up in at least one chunk.
    for i in range(6):
        assert any(f"Paragraph {i}." in c for c in chunks)


def test_oversized_single_paragraph_is_hard_split_with_overlap():
    text = "x" * 500
    chunks = chunk_text(text, chunk_size=200, overlap=50)
    assert len(chunks) > 1
    # Consecutive hard-split pieces share their overlap region.
    for a, b in zip(chunks, chunks[1:]):
        assert a[-50:] == b[:50]


def test_consecutive_packed_chunks_overlap():
    paragraphs = [f"Section {i} content here with enough words to matter." for i in range(10)]
    text = "\n\n".join(paragraphs)
    chunks = chunk_text(text, chunk_size=120, overlap=30)
    assert len(chunks) > 1
    for prev, nxt in zip(chunks, chunks[1:]):
        tail = prev[-30:]
        assert tail in nxt
