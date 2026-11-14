import type { Commit, Link, Note, Spec, System, Task } from "@/lib/db/schema";
import type { EntityCategory, GraphData, GraphEdge, GraphNode } from "./types";

export interface GraphSource {
  notes: Note[];
  specs: Spec[];
  tasks: Task[];
  systems: System[];
  commits: Commit[];
  links: Link[];
}

const RELATIONS: Record<string, string> = {
  "note-note": "links",
  "spec-task": "implements",
  "note-spec": "informs",
  "spec-spec": "relates",
  "system-system": "depends",
  "commit-spec": "delivers",
};

/** Best-effort relation label for an edge, derived from its endpoint categories. */
export function linkRelation(a: EntityCategory, b: EntityCategory): string {
  return RELATIONS[[a, b].sort().join("-")] ?? "linked";
}

/**
 * Turn the project's entities into graph nodes and edges. Pure: the same input gives the same
 * output, in a stable order (nodes sorted by key) so a layout is reproducible.
 */
export function buildGraph(src: GraphSource): GraphData {
  const nodes: GraphNode[] = [];
  const byKey = new Map<string, GraphNode>();
  const add = (n: Omit<GraphNode, "degree">) => {
    const node: GraphNode = { ...n, degree: 0 };
    nodes.push(node);
    byKey.set(node.key, node);
  };

  for (const n of src.notes) {
    add({
      key: `note:${n.id}`,
      kind: n.type,
      category: "note",
      refId: n.id,
      label: n.title,
      tags: n.tags ?? [],
      folderId: n.folderId ?? null,
    });
  }
  for (const s of src.specs) {
    add({ key: `spec:${s.id}`, kind: "spec", category: "spec", refId: s.id, label: s.number, tags: [], folderId: null });
  }
  for (const t of src.tasks) {
    add({ key: `task:${t.id}`, kind: "task", category: "task", refId: t.id, label: t.title, tags: t.tags ?? [], folderId: null });
  }
  for (const s of src.systems) {
    add({ key: `system:${s.id}`, kind: "system", category: "system", refId: s.id, label: s.name, tags: [], folderId: null });
  }
  for (const c of src.commits) {
    add({ key: `commit:${c.id}`, kind: "commit", category: "commit", refId: c.id, label: c.sha.slice(0, 7), tags: [], folderId: null });
  }
  nodes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const edge = (a: string, b: string) => {
    if (a === b) return;
    const na = byKey.get(a);
    const nb = byKey.get(b);
    if (!na || !nb) return;
    // One edge per pair, whichever side declared it first (a task and its spec often both do).
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(pair)) return;
    seen.add(pair);
    edges.push({ source: a, target: b, relation: linkRelation(na.category, nb.category) });
    na.degree += 1;
    nb.degree += 1;
  };

  for (const l of src.links) {
    if (l.linkType === "wikilink" && l.sourceType === "note" && l.targetType === "note") {
      edge(`note:${l.sourceId}`, `note:${l.targetId}`);
    }
  }
  for (const t of src.tasks) if (t.specId) edge(`task:${t.id}`, `spec:${t.specId}`);
  for (const s of src.specs) {
    for (const id of s.linkedNoteIds) edge(`spec:${s.id}`, `note:${id}`);
    for (const id of s.linkedTaskIds) edge(`spec:${s.id}`, `task:${id}`);
  }
  for (const s of src.systems) for (const dep of s.dependencies) edge(`system:${s.id}`, `system:${dep}`);
  for (const c of src.commits) for (const id of c.linkedSpecIds) edge(`commit:${c.id}`, `spec:${id}`);

  return { nodes, edges };
}
