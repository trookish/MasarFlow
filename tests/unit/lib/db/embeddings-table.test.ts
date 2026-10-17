import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("embeddings table (Dexie v11)", () => {
  it("stores Float32Array vectors and queries by project and by project+kind", async () => {
    await db.embeddings.bulkAdd([
      { id: "p1:note:n1:0", projectId: "p1", kind: "note", entityId: "n1", chunkIndex: 0, title: "A", text: "alpha", hash: "h1", vector: new Float32Array([1, 0, 0]) },
      { id: "p1:task:t1:0", projectId: "p1", kind: "task", entityId: "t1", chunkIndex: 0, title: "B", text: "beta", hash: "h2", vector: new Float32Array([0, 1, 0]) },
      { id: "p2:note:n9:0", projectId: "p2", kind: "note", entityId: "n9", chunkIndex: 0, title: "C", text: "gamma", hash: "h3", vector: new Float32Array([0, 0, 1]) },
    ]);
    const p1 = await db.embeddings.where("projectId").equals("p1").toArray();
    expect(p1).toHaveLength(2);
    expect(p1[0].vector).toBeInstanceOf(Float32Array);
    expect(await db.embeddings.where("[projectId+kind]").equals(["p1", "note"]).count()).toBe(1);
    expect(await db.embeddings.where("[projectId+entityId]").equals(["p1", "t1"]).count()).toBe(1);
  });
  it("is cleared by a full local wipe", async () => {
    const { resetData } = await import("@/lib/db/data");
    await db.embeddings.add({ id: "x", projectId: "p", kind: "note", entityId: "n", chunkIndex: 0, title: "", text: "", hash: "", vector: new Float32Array(1) });
    await resetData();
    expect(await db.embeddings.count()).toBe(0);
  });
});
