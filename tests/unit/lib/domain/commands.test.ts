import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { runDoctor } from "@/lib/db/doctor";
import { projectsRepo } from "@/lib/db/repos/projects";
import { tasksRepo } from "@/lib/db/repos/tasks";
import { specsRepo } from "@/lib/db/repos/specs";
import { notesRepo } from "@/lib/db/repos/notes";
import { linksRepo } from "@/lib/db/repos/links";
import { PROJECT_CHILD_TABLES, emptyTrash, removeEntity, restoreEntity, runCommand } from "@/lib/domain/commands";
import { trashId } from "@/lib/domain/events";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  const p = await projectsRepo.create({ name: "Alpha" });
  const spec = await specsRepo.create({ projectId: p.id, number: "S-1", title: "Spec" });
  const t1 = await tasksRepo.create({ projectId: p.id, title: "One", specId: spec.id, status: "done" });
  const t2 = await tasksRepo.create({ projectId: p.id, title: "Two", specId: spec.id });
  await specsRepo.update(spec.id, { linkedTaskIds: [t1.id, t2.id] });
  await specsRepo.recomputeProgress(spec.id);
  await linksRepo.create({
    projectId: p.id,
    sourceType: "spec",
    sourceId: spec.id,
    targetType: "task",
    targetId: t2.id,
    linkType: "implements",
  });
  return { p, spec, t1, t2 };
}

describe("domain commands", () => {
  it("every table is either project-indexed or classified", () => {
    for (const t of db.tables) {
      const indexed = t.schema.indexes.some((i) => i.name === "projectId");
      expect(indexed || t.name in PROJECT_CHILD_TABLES, `${t.name} is unclassified`).toBe(true);
    }
  });

  it("removing a task cleans links, linkedTaskIds and spec progress in one go", async () => {
    const { spec, t2 } = await seed();
    expect((await db.specs.get(spec.id))!.implementationProgress).toBe(50);
    await tasksRepo.remove(t2.id);
    const s = (await db.specs.get(spec.id))!;
    expect(s.linkedTaskIds).not.toContain(t2.id);
    expect(s.implementationProgress).toBe(100);
    expect(await db.links.count()).toBe(0);
    expect(await db.trash.get(trashId("task", t2.id))).toBeTruthy();
    expect((await runDoctor(db)).total).toBe(0);
    expect((await db.events.toArray()).map((e) => e.op)).toContain("remove");
  });

  it("restore puts the task, its link and its reference back", async () => {
    const { spec, t2 } = await seed();
    await tasksRepo.remove(t2.id);
    expect(await restoreEntity(trashId("task", t2.id))).toBe(true);
    expect(await db.tasks.get(t2.id)).toBeTruthy();
    const s = (await db.specs.get(spec.id))!;
    expect(s.linkedTaskIds).toContain(t2.id);
    expect(s.implementationProgress).toBe(50);
    expect(await db.links.count()).toBe(1);
    expect(await db.trash.count()).toBe(0);
    expect((await runDoctor(db)).total).toBe(0);
  });

  it("removing a spec detaches its tasks; restore reattaches them", async () => {
    const { spec, t1 } = await seed();
    await specsRepo.remove(spec.id);
    expect((await db.tasks.get(t1.id))!.specId).toBeNull();
    expect((await runDoctor(db)).total).toBe(0);
    await restoreEntity(trashId("spec", spec.id));
    expect((await db.tasks.get(t1.id))!.specId).toBe(spec.id);
  });

  it("deleting a project leaves no orphan in any table", async () => {
    const { p } = await seed();
    const other = await projectsRepo.create({ name: "Beta" });
    await tasksRepo.create({ projectId: other.id, title: "Keep" });
    await db.canvases.add({ id: "c1", projectId: p.id, name: "Board", createdAt: 1, updatedAt: 1 } as never);
    await db.canvasNodes.add({ id: "cn1", canvasId: "c1", type: "text", x: 0, y: 0, data: {} } as never);
    await removeEntity("task", (await db.tasks.where("projectId").equals(p.id).first())!.id);
    await projectsRepo.remove(p.id);
    for (const t of db.tables) {
      if (t.schema.indexes.some((i) => i.name === "projectId")) {
        expect(await t.where("projectId").equals(p.id).count(), t.name).toBe(0);
      }
    }
    expect(await db.canvasNodes.count()).toBe(0);
    expect(await db.tasks.where("projectId").equals(other.id).count()).toBe(1);
    expect((await runDoctor(db)).total).toBe(0);
  });

  it("a throwing command rolls back the data and the event", async () => {
    const { t1 } = await seed();
    await expect(
      runCommand([db.tasks], "user", async (tx) => {
        await db.tasks.update(t1.id, { title: "changed" });
        tx.emit({ projectId: t1.projectId, entityKind: "task", entityId: t1.id, op: "update" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await db.tasks.get(t1.id))!.title).toBe("One");
    expect(await db.events.where("[entityKind+entityId]").equals(["task", t1.id]).count()).toBe(0);
  });

  it("empty trash purges a project's entries", async () => {
    const { p, t1, t2 } = await seed();
    await tasksRepo.remove(t1.id);
    await tasksRepo.remove(t2.id);
    expect(await emptyTrash(p.id)).toBe(2);
    expect(await db.trash.count()).toBe(0);
  });
});

describe("wikilinks (D7)", () => {
  it("saving a note with an unknown [[link]] creates no note", async () => {
    const p = await projectsRepo.create({ name: "Alpha" });
    const n = await notesRepo.create({ projectId: p.id, title: "Home", body: "See [[Ideas]] and [[Ideas]]" });
    expect(await db.notes.count()).toBe(1);
    expect((await linksRepo.listUnresolved(p.id)).map((l) => l.unresolvedTitle)).toEqual(["Ideas"]);
    expect(await linksRepo.listBySource("note", n.id)).toEqual([]);
    expect((await runDoctor(db)).total).toBe(0);
  });

  it("creating the note resolves the waiting link", async () => {
    const p = await projectsRepo.create({ name: "Alpha" });
    const home = await notesRepo.create({ projectId: p.id, title: "Home", body: "See [[Ideas]]" });
    const ideas = await notesRepo.ensureByTitle(p.id, "ideas");
    expect(await linksRepo.listUnresolved(p.id)).toEqual([]);
    expect((await linksRepo.listBySource("note", home.id)).map((l) => l.targetId)).toEqual([ideas.id]);
  });

  it("removing a linked note turns the link unresolved; restore resolves it again", async () => {
    const p = await projectsRepo.create({ name: "Alpha" });
    const ideas = await notesRepo.create({ projectId: p.id, title: "Ideas" });
    const home = await notesRepo.create({ projectId: p.id, title: "Home", body: "[[Ideas]]" });
    expect((await linksRepo.listByTarget("note", ideas.id)).length).toBe(1);
    await notesRepo.remove(ideas.id);
    expect((await linksRepo.listUnresolved(p.id)).map((l) => l.sourceId)).toEqual([home.id]);
    expect((await runDoctor(db)).total).toBe(0);
    await restoreEntity(trashId("note", ideas.id));
    expect((await linksRepo.listByTarget("note", ideas.id)).length).toBe(1);
    expect(await linksRepo.listUnresolved(p.id)).toEqual([]);
  });
});
