"""Git/GitHub intelligence (#9) — semantic commit analysis & webhooks.

Classifies commits (feat/fix/refactor/test/docs/chore) from message + diff,
auto-generates Commit.aiSummary, and suggests spec/task links semantically
(augmenting the RFC-\\d{1,4} regex in github-sync.ts). A /webhook/github
receiver enables push-driven auto-sync when a tunnel is available.

Skeleton; the /analyze/commit + /webhook/github endpoints, the GitJob
handler, and the classification logic land in Step 4.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("masarflow.git_intel")


def analyze_commit(sha: str, message: str, diff: str) -> dict:
    """Classify a commit and produce a summary + impact/suggested links.
    Implemented in Step 4."""
    raise NotImplementedError


async def handle_git_job(job) -> None:  # type: ignore[no-untyped-def]
    """GitJob handler — analyzes a queued commit and writes aiSummary back.
    Registered with the queue in Step 4."""
    logger.debug("git job stub for %s", job.sha)
