import { db } from "@/lib/db";
import type { EmbeddingRow } from "@/lib/db/schema";
import { hashContent } from "@/lib/sync";
import { buildSearchItems } from "@/lib/utils/search";
import { chunkText } from "./chunking";
import { getEmbedClient } from "./client";
import { bumpIndexVersion } from "./search";

export interface IndexDeps {
  embed: (texts: string[]) => Promise<Float32Array[]>;
}

export interface IndexResult {
  added: number;
  removed: number;
  unchanged: number;
}

interface Wanted {
  id: string;
  kind: string;
  entityId: string;
  chunkIndex: number;
  title: string;
  text: string;
  hash: string;
}

export async function reindexProject(
  projectId: string,
  deps: IndexDeps = { embed: (t) => getEmbedClient().embed(t) },
  onProgress?: (done: number, total: number) => void,
): Promise<IndexResult> {
  if (!projectId) return { added: 0, removed: 0, unchanged: 0 };

  const wanted = new Map<string, Wanted>();
  for (const item of await buildSearchItems(projectId)) {
    const full = [item.title, item.subtitle, item.body].filter(Boolean).join("\n\n");
    chunkText(full).forEach((text, chunkIndex) => {
      const id = `${projectId}:${item.kind}:${item.id}:${chunkIndex}`;
      wanted.set(id, { id, kind: item.kind, entityId: item.id, chunkIndex, title: item.title, text, hash: hashContent(`${item.title}\u0000${text}`) });
    });
  }

  const existing = await db.embeddings.where("projectId").equals(projectId).toArray();
  const have = new Map(existing.map((r) => [r.id, r.hash]));
  const toEmbed = [...wanted.values()].filter((w) => have.get(w.id) !== w.hash);
  const toRemove = existing.filter((r) => !wanted.has(r.id)).map((r) => r.id);
  const replaced = toEmbed.filter((w) => have.has(w.id)).length;

  onProgress?.(0, toEmbed.length);
  for (let i = 0; i < toEmbed.length; i += 32) {
    const batch = toEmbed.slice(i, i + 32);
    const vectors = await deps.embed(batch.map((b) => `${b.title}\n${b.text}`));
    const rows: EmbeddingRow[] = batch.map((b, k) => ({ ...b, projectId, vector: vectors[k] }));
    await db.embeddings.bulkPut(rows);
    onProgress?.(Math.min(i + 32, toEmbed.length), toEmbed.length);
  }
  if (toRemove.length) await db.embeddings.bulkDelete(toRemove);
  if (toEmbed.length || toRemove.length) bumpIndexVersion(projectId);

  // An edited chunk counts as one removed (the old vector) and one added (the new vector).
  return { added: toEmbed.length, removed: toRemove.length + replaced, unchanged: wanted.size - toEmbed.length };
}
