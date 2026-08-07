import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { notesRepo } from "@/lib/db/repos/notes";
import { linksRepo } from "@/lib/db/repos/links";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("notesRepo wikilink syncing", () => {
  it("auto-generates an excerpt on create", async () => {
    const note = await notesRepo.create({
      projectId: "p1",
      title: "Note A",
      body: "# Heading\n\nThis is the body text.",
    });
    expect(note.excerpt).toBe("Heading This is the body text.");
  });

  it("creates a placeholder note and wikilink edge for [[Title]]", async () => {
    const source = await notesRepo.create({ projectId: "p1", title: "Source" });
    await notesRepo.update(source.id, { body: "Link to [[Target Note]]" });

    const target = await notesRepo.getByTitle("p1", "target note");
    expect(target).toBeDefined();

    const links = await linksRepo.listBySource("note", source.id);
    expect(links).toHaveLength(1);
    expect(links[0].linkType).toBe("wikilink");
    expect(links[0].targetId).toBe(target!.id);
  });

  it("reconciles wikilinks when the body changes", async () => {
    const source = await notesRepo.create({ projectId: "p1", title: "Src" });
    await notesRepo.create({ projectId: "p1", title: "One" });
    await notesRepo.create({ projectId: "p1", title: "Two" });

    await notesRepo.update(source.id, { body: "[[One]]" });
    expect(await linksRepo.listBySource("note", source.id)).toHaveLength(1);

    await notesRepo.update(source.id, { body: "[[One]] and [[Two]]" });
    expect(await linksRepo.listBySource("note", source.id)).toHaveLength(2);

    await notesRepo.update(source.id, { body: "no links now" });
    expect(await linksRepo.listBySource("note", source.id)).toHaveLength(0);
  });

  it("removes a note and its links on delete", async () => {
    const a = await notesRepo.create({ projectId: "p1", title: "A" });
    await notesRepo.update(a.id, { body: "[[B]]" });
    const b = await notesRepo.getByTitle("p1", "B");

    await notesRepo.remove(a.id);
    expect(await notesRepo.get(a.id)).toBeUndefined();
    // The outgoing wikilink from A is gone.
    expect(await linksRepo.listByTarget("note", b!.id)).toHaveLength(0);
  });
});
