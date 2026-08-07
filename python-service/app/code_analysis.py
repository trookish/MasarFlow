"""Code analysis & standards enforcement (#4) — tree-sitter AST analysis.

Replaces the regex-only Standards Enforcer with real static analysis for code
files: multi-language AST parsing (tree-sitter), complexity/LOC metrics,
symbol extraction, and an import/call dependency graph that feeds the
Architecture diagram. Markdown notes/specs/tasks keep using the regex path.

Skeleton; the /analyze/file + /analyze/directory endpoints, the AnalysisJob
handler, and the tree-sitter logic land in Step 3. Lazy import keeps the
service booting without tree-sitter.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("masarflow.code_analysis")


def is_available() -> bool:
    try:
        import tree_sitter  # noqa: F401
        import tree_sitter_languages  # noqa: F401
        return True
    except ImportError:
        return False


def analyze_file(content: str, language: str) -> dict:
    """Parse one source file and return violations, complexity/LOC, and
    symbols. Implemented in Step 3."""
    raise NotImplementedError


def dependency_graph(root: str) -> dict:
    """Walk a directory and return an import/call dependency graph for the
    Architecture diagram. Implemented in Step 3."""
    raise NotImplementedError


async def handle_analysis_job(job) -> None:  # type: ignore[no-untyped-def]
    """AnalysisJob handler — analyzes a queued changed file. Registered with
    the queue in Step 3."""
    logger.debug("analysis job stub for %s", job.path)
