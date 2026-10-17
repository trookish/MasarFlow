import { db } from "@/lib/db";
import type { EmbeddingRow } from "@/lib/db/schema";
import { getEmbedClient } from "./client";
import { topK } from "./vector";

/** Below this cosine similarity a chunk is noise for MiniLM-class embeddings. */
export const MIN_SCORE = 0.25;

export interface SearchDeps {
  embed: (texts: string[]) => Promise<Float32Array[]>;
}
const defaultDeps = (): SearchDeps => ({ embed: (t) => getEmbedClient().embed(t) });

export interface SemanticHit {
  id: string;
  kind: string;
  score: number;
}

export interface RagChunk {
  entityId: string;
  kind: string;
  title: string;
  text: string;
  score: number;
}

const versions = new Map<string, number>();
const cache = new Map<string, { version: number; rows: EmbeddingRow[] }>();

/** Called by the indexer after it writes, so the in-memory copy is reloaded. */
export function bumpIndexVersion(projectId: string): void {
  versions.set(projectId, (versions.get(projectId) ?? 0) + 1);
}

async function rowsFor(projectId: string): Promise<EmbeddingRow[]> {
  const version = versions.get(projectId) ?? 0;
  const hit = cache.get(projectId);
  if (hit && hit.version === version) return hit.rows;
  const rows = await db.embeddings.where("projectId").equals(projectId).toArray();
  cache.set(projectId, { version, rows });
  return rows;
}

async function embedQuery(query: string, deps: SearchDeps): Promise<Float32Array | null> {
  const q = query.trim();
  if (!q) return null;
  const [v] = await deps.embed([q]);
  return v ?? null;
}

/** One hit per entity (its best chunk), best first. */
export async function semanticSearch(
  projectId: string,
  query: string,
  limit: number,
  deps: SearchDeps = defaultDeps(),
): Promise<SemanticHit[]> {
  const rows = await rowsFor(projectId);
  if (rows.length === 0) return [];
  const qv = await embedQuery(query, deps);
  if (!qv) return [];
  const seen = new Set<string>();
  const hits: SemanticHit[] = [];
  for (const { row, score } of topK(qv, rows, rows.length, MIN_SCORE)) {
    const key = `${row.kind}:${row.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ id: row.entityId, kind: row.kind, score });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Best chunks (not collapsed) until `budgetChars` is used up. */
export async function retrieveRagChunks(
  projectId: string,
  query: string,
  topChunks: number,
  budgetChars: number,
  deps: SearchDeps = defaultDeps(),
): Promise<RagChunk[]> {
  const rows = await rowsFor(projectId);
  if (rows.length === 0) return [];
  const qv = await embedQuery(query, deps);
  if (!qv) return [];
  const out: RagChunk[] = [];
  let used = 0;
  for (const { row, score } of topK(qv, rows, topChunks, MIN_SCORE)) {
    if (used + row.text.length > budgetChars && out.length > 0) break;
    if (row.text.length > budgetChars) break;
    used += row.text.length;
    out.push({ entityId: row.entityId, kind: row.kind, title: row.title, text: row.text, score });
  }
  return out;
}
