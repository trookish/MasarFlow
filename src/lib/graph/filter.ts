import type { GraphKind } from "@/lib/colors";
import type { EntityCategory, GraphData, GraphEdge, GraphNode } from "./types";

export interface GraphFilters {
  categories: ReadonlySet<EntityCategory>;
  /** Restrict to these node kinds (note types and cross-entity kinds); null = every kind. */
  kinds: ReadonlySet<GraphKind> | null;
  /** Only nodes carrying this tag; "" = any. */
  tag: string;
  /** Only notes in this folder; "" = any. */
  folderId: string;
  showOrphans: boolean;
}

export interface LocalView {
  centerKey: string;
  depth: number;
}

export type Adjacency = Map<string, string[]>;

export function buildAdjacency(edges: readonly GraphEdge[]): Adjacency {
  const adj: Adjacency = new Map();
  const push = (a: string, b: string) => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (const e of edges) {
    push(e.source, e.target);
    push(e.target, e.source);
  }
  return adj;
}

/** Breadth-first distances (in edges) from `centerKey`, out to `depth`. The centre is at 0. */
export function neighborhood(adj: Adjacency, centerKey: string, depth: number): Map<string, number> {
  const dist = new Map<string, number>([[centerKey, 0]]);
  let frontier = [centerKey];
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next: string[] = [];
    for (const key of frontier) {
      for (const other of adj.get(key) ?? []) {
        if (!dist.has(other)) {
          dist.set(other, d);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

export function nodePassesFilters(n: GraphNode, f: GraphFilters): boolean {
  if (!f.categories.has(n.category)) return false;
  if (f.kinds && !f.kinds.has(n.kind)) return false;
  if (f.tag && !n.tags.includes(f.tag)) return false;
  if (f.folderId && n.folderId !== f.folderId) return false;
  return true;
}

/**
 * The nodes and edges to draw: attribute filters first, then (in local mode) the neighbourhood of
 * the centre within the filtered graph, otherwise the orphan filter. The local view always keeps
 * its centre, even when it has no connections, so the orphan filter does not apply to it.
 */
export function computeVisible(data: GraphData, f: GraphFilters, local: LocalView | null): GraphData {
  const base = data.nodes.filter((n) => nodePassesFilters(n, f));
  const baseKeys = new Set(base.map((n) => n.key));
  const baseEdges = data.edges.filter((e) => baseKeys.has(e.source) && baseKeys.has(e.target));

  let keep: Set<string>;
  if (local) {
    keep = baseKeys.has(local.centerKey)
      ? new Set(neighborhood(buildAdjacency(baseEdges), local.centerKey, local.depth).keys())
      : new Set();
  } else if (f.showOrphans) {
    keep = baseKeys;
  } else {
    keep = new Set<string>();
    for (const e of baseEdges) {
      keep.add(e.source);
      keep.add(e.target);
    }
  }
  return {
    nodes: base.filter((n) => keep.has(n.key)),
    edges: baseEdges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}

/** Distinct tags across the nodes, most used first (ties alphabetical). */
export function collectTags(nodes: readonly GraphNode[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const n of nodes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Case-insensitive label match; the empty query matches everything. */
export function matchesQuery(node: GraphNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || node.label.toLowerCase().includes(q);
}
