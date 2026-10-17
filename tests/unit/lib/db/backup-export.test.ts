import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { exportBackup, serializeBackup, BACKUP_FORMAT, BACKUP_VERSION } from "@/lib/db/backup";
import { notesRepo, projectsRepo } from "@/lib/db/repos";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("exportBackup", () => {
  it("captures every table row with a versioned envelope", async () => {
    const p = await projectsRepo.create({ name: "Game" });
    await notesRepo.create({ projectId: p.id, title: "Idea", body: "Dash ability" });
    const file = await exportBackup(db, "0.2.0.0");
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.version).toBe(BACKUP_VERSION);
    expect(file.appVersion).toBe("0.2.0.0");
    expect(file.dexieVersion).toBe(db.verno);
    expect(file.tables.projects).toHaveLength(1);
    expect(file.tables.notes).toHaveLength(1);
  });
  it("excludes the rebuildable embeddings table", async () => {
    await db.embeddings.add({ id: "e", projectId: "p", kind: "note", entityId: "n", chunkIndex: 0, title: "", text: "", hash: "", vector: new Float32Array(2) });
    const file = await exportBackup(db, "x");
    expect("embeddings" in file.tables).toBe(false);
  });
  it("never exports provider API keys", async () => {
    await db.aiConnections.add({ id: "c", providerId: "openai", label: "L", apiKey: "sk-SECRET", baseUrl: "", createdAt: 1, updatedAt: 1 });
    const text = serializeBackup(await exportBackup(db, "x"));
    expect(text).not.toContain("sk-SECRET");
  });
  it("encodes Blobs (attachments) as base64 and keeps them restorable", async () => {
    await db.attachments.add({ id: "a", projectId: "p", name: "n.txt", mimeType: "text/plain", size: 5, blob: new Blob(["hello"], { type: "text/plain" }), createdAt: 1 });
    const file = await exportBackup(db, "x");
    const row = file.tables.attachments[0] as { blob: { __type: string; mime: string; data: string } };
    expect(row.blob.__type).toBe("blob");
    expect(row.blob.mime).toBe("text/plain");
    expect(atob(row.blob.data)).toBe("hello");
  });
});
