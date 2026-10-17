import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { BACKUP_FORMAT, BACKUP_VERSION, exportBackup, serializeBackup } from "@/lib/db/backup";
import { BackupError, importBackup, parseBackup } from "@/lib/db/backup-import";
import { notesRepo, projectsRepo } from "@/lib/db/repos";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seedAndExport(): Promise<string> {
  const p = await projectsRepo.create({ name: "Game" });
  await notesRepo.create({ projectId: p.id, title: "Idea", body: "Dash" });
  await db.attachments.add({ id: "a", projectId: p.id, name: "n.txt", mimeType: "text/plain", size: 5, blob: new Blob(["hello"], { type: "text/plain" }), createdAt: 1 });
  return serializeBackup(await exportBackup(db, "0.2.0.0"));
}

describe("parseBackup", () => {
  it.each([
    ["not json", "{", "not-json"],
    ["wrong format", JSON.stringify({ format: "other", version: 1, tables: {} }), "wrong-format"],
    ["future file version", JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, dexieVersion: 1, tables: {} }), "too-new"],
    ["future schema", JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, dexieVersion: 9999, tables: {} }), "too-new"],
    ["unknown table", JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, dexieVersion: 10, tables: { bogus: [] } }), "unknown-table"],
  ])("rejects %s", (_n, text, code) => {
    try {
      parseBackup(text, db);
      throw new Error("expected BackupError");
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError);
      expect((e as BackupError).code).toBe(code);
    }
  });
  it("accepts a real export", async () => {
    expect(parseBackup(await seedAndExport(), db).format).toBe(BACKUP_FORMAT);
  });
});

describe("importBackup", () => {
  it("replace: restores exactly the exported state, blobs included", async () => {
    const text = await seedAndExport();
    await Promise.all(db.tables.map((t) => t.clear()));
    await projectsRepo.create({ name: "Junk that must disappear" });
    const summary = await importBackup(db, parseBackup(text, db), "replace");
    expect(summary.tables.projects).toBe(1);
    expect((await db.projects.toArray()).map((p) => p.name)).toEqual(["Game"]);
    const att = await db.attachments.get("a");
    expect(await att!.blob.text()).toBe("hello");
  });
  it("merge: adds missing rows and never overwrites or duplicates existing ones", async () => {
    const text = await seedAndExport();
    const existing = (await db.notes.toArray())[0];
    await db.notes.update(existing.id, { title: "Edited locally" });
    const summary = await importBackup(db, parseBackup(text, db), "merge");
    expect(summary.tables.notes).toBe(0);
    expect((await db.notes.get(existing.id))!.title).toBe("Edited locally");
    await db.notes.clear();
    const again = await importBackup(db, parseBackup(text, db), "merge");
    expect(again.tables.notes).toBe(1);
    expect(await db.notes.count()).toBe(1);
  });
  it("replace also clears the rebuildable index so it is re-created", async () => {
    const text = await seedAndExport();
    await db.embeddings.add({ id: "e", projectId: "p", kind: "note", entityId: "n", chunkIndex: 0, title: "", text: "", hash: "", vector: new Float32Array(1) });
    await importBackup(db, parseBackup(text, db), "replace");
    expect(await db.embeddings.count()).toBe(0);
  });
  it("is atomic: a failing row leaves the previous data intact", async () => {
    await projectsRepo.create({ name: "Keep me" });
    const bad = { format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion: "x", dexieVersion: db.verno, exportedAt: 1, tables: { projects: [{ id: "dup" }, { id: "dup" }] } };
    await expect(importBackup(db, parseBackup(JSON.stringify(bad), db), "replace")).rejects.toBeTruthy();
    expect((await db.projects.toArray()).map((p) => p.name)).toEqual(["Keep me"]);
  });
});
