import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { installDirtyTracking, takeDirty } from "@/lib/db/dirty";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  takeDirty();
});

describe("dirty tracking", () => {
  it("counts creates, updates and deletes on user-data tables", async () => {
    const off = installDirtyTracking(db);
    await db.notes.add({ id: "n", projectId: "p", title: "t", body: "", type: "note", tags: [], folderId: null, createdAt: 1, updatedAt: 1 } as never);
    await db.notes.update("n", { title: "u" });
    await db.notes.delete("n");
    expect(takeDirty()).toBe(3);
    expect(takeDirty()).toBe(0);
    off();
  });
  it("ignores noisy / rebuildable tables and stops after unsubscribe", async () => {
    const off = installDirtyTracking(db);
    await db.embeddings.add({ id: "e", projectId: "p", kind: "k", entityId: "x", chunkIndex: 0, title: "", text: "", hash: "", vector: new Float32Array(1) });
    await db.watchEvents.add({ id: "w", projectId: "p", path: "a", kind: "modified", fileType: "other", createdAt: 1 } as never);
    expect(takeDirty()).toBe(0);
    off();
    await db.notes.add({ id: "n2", projectId: "p", title: "t", body: "", type: "note", tags: [], folderId: null, createdAt: 1, updatedAt: 1 } as never);
    expect(takeDirty()).toBe(0);
  });
});
