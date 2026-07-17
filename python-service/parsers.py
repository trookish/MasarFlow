"""File & document intelligence (#7) — web reader, PDF/Office/OCR/audio.

The web reader (trafilatura) replaces the regex-based extractReaderText in
/api/canvas/embed. Binary parsers turn PDFs/Office docs/images/audio into
text the embedding pipeline can index. Heavy models (whisper, pytesseract,
CLIP) are optional — see requirements-extra.txt.

This is a skeleton; endpoints and the ParseJob handler land in Step 1 (web)
and Step 5 (binary). Functions use lazy imports so the service boots even
when optional deps aren't installed.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("masarflow.parsers")


def is_available(modality: str) -> bool:
    """Whether the optional dep for a given modality is importable."""
    try:
        if modality == "web":
            import trafilatura  # noqa: F401
        elif modality == "pdf":
            import pypdf  # noqa: F401
        elif modality == "office":
            import docx  # noqa: F401
            import openpyxl  # noqa: F401
        elif modality == "image":
            import pytesseract  # noqa: F401
            import PIL  # noqa: F401
        elif modality == "audio":
            import whisper  # noqa: F401
        else:
            return False
        return True
    except ImportError:
        return False


async def parse_web(url: str) -> dict:
    """Fetch + extract reader text from a web page. Implemented in Step 1."""
    raise NotImplementedError


async def parse_pdf(content_b64: str) -> dict:
    """Extract text (with layout) from a PDF. Implemented in Step 5."""
    raise NotImplementedError


async def parse_office(content_b64: str, ext: str) -> dict:
    """Extract text from .docx/.xlsx/.pptx. Implemented in Step 5."""
    raise NotImplementedError


async def ocr_image(content_b64: str) -> dict:
    """OCR an image to text. Implemented in Step 5 (extras)."""
    raise NotImplementedError


async def transcribe_audio(content_b64: str) -> dict:
    """Transcribe audio to text via whisper. Implemented in Step 5 (extras)."""
    raise NotImplementedError


async def handle_parse_job(job) -> None:  # type: ignore[no-untyped-def]
    """ParseJob handler — parses a queued binary file and feeds the result to
    the embedding pipeline. Registered with the queue in Step 5."""
    logger.debug("parse job stub for %s (%s)", job.path, job.modality)
