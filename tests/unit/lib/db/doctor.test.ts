import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { ENTITY_TABLES, runDoctor } from "@/lib/db/doctor";
import { entityKindSchema } from "@/lib/db/schema";

const now = 1;
const project = (id: string) => ({ id, name: id, slug: id, createdAt: now, updatedAt: now }) as never;
const note = (id: string, projectId: string) =>
  ({ id, projectId, title: id, body: "", type: "note", tags: [], folderId: null, createdAt: now, updatedAt: now }) as never;
const task = (id: string, projectId: string) =>
  ({ id, projectId, title: id, status: "todo", priority: "medium", createdAt: now, updatedAt: now }) as never;
const sync = (id: string, path: string, entityId: string | null) =>
  ({ id, projectId: "p", path, hash: "", mtime: 0, status: "synced", entityType: "note", entityId, lastSyncedAt: null }) as never;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const counts = async () => Object.fromEntries((await runDoctor(db)).results.map((r) => [r.check, r.count]));

describe("data doctor", () => {
  it("maps every entity kind to a real table", () => {
    const tables = new Set(db.tables.map((t) => t.name));
    for (const kind of entityKindSchema.options) expect(tables.has(ENTITY_TABLES[kind])).toBe(true);
  });

  it("reports zero on a clean database", async () => {
    await db.projects.add(project("p"));
    await db.notes.add(note("n1", "p"));
    await db.tasks.add(task("t1", "p"));
    await db.links.add({ id: "l1", projectId: "p", sourceType: "note", sourceId: "n1", targetType: "task", targetId: "t1", linkType: "reference", label: "", createdAt: now } as never);
    await db.syncFiles.add(sync("s1", "notes/n1.md", "n1"));
    const report = await runDoctor(db);
    expect(report.total).toBe(0);
    expect(report.results.every((r) => r.count === 0)).toBe(true);
  });

  it("finds exactly one of each defect", async () => {
    await db.projects.add(project("p"));
    await db.notes.add(note("n1", "p"));
    await db.notes.add(note("orphan", "gone-project"));
    await db.links.add({ id: "l1", projectId: "p", sourceType: "note", sourceId: "n1", targetType: "task", targetId: "missing", linkType: "reference", label: "", createdAt: now } as never);
    await db.specs.add({ id: "s1", projectId: "p", number: "S-1", title: "s", linkedTaskIds: ["missing"], linkedNoteIds: [], createdAt: now, updatedAt: now } as never);
    await db.syncFiles.add(sync("sf1", "notes/n1.md", "n1"));
    await db.syncFiles.add(sync("sf2", "notes/n1.md", "n1"));
    await db.syncFiles.add(sync("sf3", "notes/gone.md", "deleted-note"));
    expect(await counts()).toEqual({
      "orphan-project-rows": 1,
      "dangling-links": 1,
      "stale-linked-task-ids": 1,
      "sync-rows-without-entity": 1,
      "duplicate-sync-paths": 1,
    });
    const report = await runDoctor(db);
    expect(report.results.find((r) => r.check === "orphan-project-rows")!.sample).toEqual(["notes:orphan"]);
  });
});
