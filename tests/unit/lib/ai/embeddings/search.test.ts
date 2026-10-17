import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { semanticSearch, retrieveRagChunks, bumpIndexVersion } from "@/lib/ai/embeddings/search";

/** Toy 3-d "embedding": [mentions auth, mentions game, mentions food]. */
const toy = (t: string): Float32Array => {
  const s = t.toLowerCase();
  const v = [/auth|login|token|jwt/.test(s) ? 1 : 0, /game|level|player/.test(s) ? 1 : 0, /cake|recipe|food/.test(s) ? 1 : 0];
  return new Float32Array(v.some(Boolean) ? v : [0.01, 0.01, 0.01]);
};
const deps = { embed: async (texts: string[]) => texts.map(toy) };

async function seed(): Promise<void> {
  await db.embeddings.bulkAdd([
    { id: "p1:note:n1:0", projectId: "p1", kind: "note", entityId: "n1", chunkIndex: 0, title: "Login flow", text: "JWT login and token refresh", hash: "a", vector: toy("jwt login") },
    { id: "p1:note:n1:1", projectId: "p1", kind: "note", entityId: "n1", chunkIndex: 1, title: "Login flow", text: "Token expiry rules for auth", hash: "b", vector: toy("token auth") },
    { id: "p1:task:t1:0", projectId: "p1", kind: "task", entityId: "t1", chunkIndex: 0, title: "Level design", text: "Design the first game level", hash: "c", vector: toy("game level") },
    { id: "p2:note:x:0", projectId: "p2", kind: "note", entityId: "x", chunkIndex: 0, title: "Other project", text: "auth", hash: "d", vector: toy("auth") },
  ]);
  bumpIndexVersion("p1");
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("semanticSearch", () => {
  it("ranks by meaning, collapses chunks to one hit per entity, and stays inside the project", async () => {
    await seed();
    const hits = await semanticSearch("p1", "how do users log in with a token", 5, deps);
    expect(hits.map((h) => `${h.kind}:${h.id}`)).toEqual(["note:n1"]);
    expect(hits[0].score).toBeGreaterThan(0.5);
  });
  it("returns nothing for an unrelated query (min score)", async () => {
    await seed();
    expect(await semanticSearch("p1", "chocolate cake recipe", 5, deps)).toEqual([]);
  });
  it("returns [] for a blank query or an unindexed project", async () => {
    expect(await semanticSearch("p1", "   ", 5, deps)).toEqual([]);
    expect(await semanticSearch("nope", "auth", 5, deps)).toEqual([]);
  });
});

describe("retrieveRagChunks", () => {
  it("returns the best chunks (not collapsed) within the character budget", async () => {
    await seed();
    const chunks = await retrieveRagChunks("p1", "token auth", 6, 10_000, deps);
    expect(chunks.map((c) => c.entityId)).toContain("n1");
    expect(chunks[0]).toMatchObject({ kind: "note", entityId: "n1", title: "Login flow" });
    const tiny = await retrieveRagChunks("p1", "token auth", 6, 20, deps);
    expect(tiny.length).toBeLessThanOrEqual(1);
  });
});
