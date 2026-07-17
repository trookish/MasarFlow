"""Knowledge-graph analysis (#5) — communities, centrality, link prediction.

Turns the Link table's typed edges (wikilink/dependency/reference/implements/
relates) across 8 entity kinds into real graph analysis via networkx: Louvain
community detection, PageRank/betweenness centrality, cycle detection, and
link prediction. The browser's KnowledgeGraph component calls /graph/analyze
(debounced) to color nodes by community, size by centrality, and surface
dashed reviewable suggested links.

Skeleton; the /graph/analyze endpoint, the GraphJob handler, and the networkx
logic land in Step 2. Lazy import keeps the service booting without networkx.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("masarflow.graph")


def is_available() -> bool:
    try:
        import networkx  # noqa: F401
        return True
    except ImportError:
        return False


def analyze(project_id: str, nodes: list[dict], edges: list[dict]) -> dict:
    """Build a networkx graph from the passed nodes/edges and return
    communities, centralities, cycles, and predicted links. Implemented in
    Step 2."""
    raise NotImplementedError


async def handle_graph_job(job) -> None:  # type: ignore[no-untyped-def]
    """GraphJob handler — recomputes graph analysis after links change.
    Registered with the queue in Step 2."""
    logger.debug("graph job stub for %s", job.project_id)
