import type { Note, NoteType } from "@/lib/db/schema";
import { parseWikiLinks, slugify } from "@/lib/markdown/links";

export const NOTE_TYPE_ACCENT: Record<NoteType, string> = {
  idea: "var(--graph-idea)",
  system: "var(--graph-system)",
  mechanic: "var(--graph-task)",
  research: "var(--graph-doc)",
  experiment: "var(--graph-arch)",
  note: "var(--graph-note)",
  lore: "var(--graph-memory)",
  decision: "var(--graph-spec)",
};

export type GraphNoteNode = {
  id: string;
  position: { x: number; y: number };
  data: { note: Note };
  type: "note";
};

export type GraphNoteEdge = {
  id: string;
  source: string;
  target: string;
  data?: { sourceTitle: string; targetTitle: string };
};

export interface NoteGraphData {
  nodes: GraphNoteNode[];
  edges: GraphNoteEdge[];
}

function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildTitleIndex(notes: Note[]): Map<string, Note> {
  const map = new Map<string, Note>();
  for (const n of notes) {
    map.set(slugify(n.title), n);
  }
  return map;
}

export function buildNoteEdges(notes: Note[]): GraphNoteEdge[] {
  const titleIndex = buildTitleIndex(notes);
  const edges: GraphNoteEdge[] = [];
  const seen = new Set<string>();

  for (const source of notes) {
    if (!source.body) continue;
    const links = parseWikiLinks(source.body);
    for (const link of links) {
      const target = titleIndex.get(link.slug);
      if (!target || target.id === source.id) continue;
      const a = source.id;
      const b = target.id;
      const edgeId = a < b ? `${a}--${b}` : `${b}--${a}`;
      if (seen.has(edgeId)) continue;
      seen.add(edgeId);
      edges.push({
        id: edgeId,
        source: a,
        target: b,
        data: { sourceTitle: source.title, targetTitle: target.title },
      });
    }
  }

  return edges;
}

function simpleForceLayout(
  nodes: GraphNoteNode[],
  edges: GraphNoteEdge[],
  width: number,
  height: number,
): void {
  const count = nodes.length;
  if (count === 0) return;

  const center = { x: width / 2, y: height / 2 };
  const radius = Math.min(width, height) * 0.38;

  nodes.forEach((n, i) => {
    const angle = (i / Math.max(count, 1)) * Math.PI * 2 + seededRandom(i) * 0.4;
    const r = radius * (0.65 + seededRandom(i + 100) * 0.35);
    n.position.x = center.x + Math.cos(angle) * r;
    n.position.y = center.y + Math.sin(angle) * r;
  });

  const neighborSet = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!neighborSet.has(e.source)) neighborSet.set(e.source, new Set());
    if (!neighborSet.has(e.target)) neighborSet.set(e.target, new Set());
    neighborSet.get(e.source)!.add(e.target);
    neighborSet.get(e.target)!.add(e.source);
  }

  const positions = nodes.map((n) => ({ ...n.position }));

  for (let step = 0; step < 60; step++) {
    const forces = positions.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const d2 = dx * dx + dy * dy + 0.1;
        const d = Math.sqrt(d2);
        const repulse = 2800 / d2;
        const fx = (dx / d) * repulse;
        const fy = (dy / d) * repulse;
        forces[i].x += fx;
        forces[i].y += fy;
        forces[j].x -= fx;
        forces[j].y -= fy;
      }
    }

    for (const e of edges) {
      const i = nodes.findIndex((n) => n.id === e.source);
      const j = nodes.findIndex((n) => n.id === e.target);
      if (i === -1 || j === -1) continue;
      const dx = positions[j].x - positions[i].x;
      const dy = positions[j].y - positions[i].y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.1;
      const attract = d * 0.006;
      const fx = (dx / d) * attract;
      const fy = (dy / d) * attract;
      forces[i].x += fx;
      forces[i].y += fy;
      forces[j].x -= fx;
      forces[j].y -= fy;
    }

    for (let i = 0; i < count; i++) {
      forces[i].x += (center.x - positions[i].x) * 0.002;
      forces[i].y += (center.y - positions[i].y) * 0.002;
    }

    for (let i = 0; i < count; i++) {
      positions[i].x += forces[i].x * 0.25;
      positions[i].y += forces[i].y * 0.25;
    }
  }

  nodes.forEach((n, i) => {
    n.position.x = positions[i].x;
    n.position.y = positions[i].y;
  });
}

export function buildNoteGraph(notes: Note[], width = 800, height = 560): NoteGraphData {
  const nodes: GraphNoteNode[] = notes.map((note) => ({
    id: note.id,
    position: { x: 0, y: 0 },
    data: { note },
    type: "note",
  }));

  const edges = buildNoteEdges(notes);
  simpleForceLayout(nodes, edges, width, height);
  return { nodes, edges };
}

export function buildLocalGraph(
  notes: Note[],
  centerId: string,
  width = 320,
  height = 240,
): NoteGraphData {
  const center = notes.find((n) => n.id === centerId);
  if (!center) return { nodes: [], edges: [] };

  const titleIndex = buildTitleIndex(notes);
  const neighborIds = new Set<string>();

  if (center.body) {
    for (const link of parseWikiLinks(center.body)) {
      const target = titleIndex.get(link.slug);
      if (target && target.id !== centerId) neighborIds.add(target.id);
    }
  }

  for (const n of notes) {
    if (!n.body || n.id === centerId) continue;
    for (const link of parseWikiLinks(n.body)) {
      if (link.slug === slugify(center.title)) {
        neighborIds.add(n.id);
        break;
      }
    }
  }

  const allIds = new Set([centerId, ...neighborIds]);
  const nodes: GraphNoteNode[] = [];
  const centerNode: GraphNoteNode = {
    id: center.id,
    position: { x: width / 2, y: height / 2 },
    data: { note: center },
    type: "note",
  };
  nodes.push(centerNode);

  const neighbors = notes.filter((n) => neighborIds.has(n.id));
  const radius = Math.min(width, height) * 0.35;
  neighbors.forEach((n, i) => {
    const angle = (i / Math.max(neighbors.length, 1)) * Math.PI * 2;
    nodes.push({
      id: n.id,
      position: {
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
      },
      data: { note: n },
      type: "note",
    });
  });

  const edges = buildNoteEdges(notes.filter((n) => allIds.has(n.id)));
  return { nodes, edges };
}
