import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { notesRepo } from "@/lib/db/repos";
import { promoteNote } from "@/lib/domain/commands";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("promoteNote", () => {
  it.each(["task", "spec", "doc"] as const)(
    "promotes a note to a %s and links them",
    async (target) => {
      const note = await notesRepo.create({
        projectId: "p",
        title: "Offline mode",
        body: "Cache reads.",
      } as never);
      const made = await promoteNote(note.id, target);
      expect(made?.kind).toBe(target);

      const table = { task: db.tasks, spec: db.specs, doc: db.docs }[target];
      expect((await table.get(made!.id))?.title).toBe("Offline mode");

      const links = await db.links
        .where("[sourceType+sourceId]")
        .equals(["note", note.id])
        .toArray();
      expect(links).toEqual([
        expect.objectContaining({
          targetType: target,
          targetId: made!.id,
          linkType: "relates",
        }),
      ]);
      expect(await db.notes.get(note.id)).toBeTruthy(); // the note stays
    },
  );

  it("numbers promoted specs after the highest RFC", async () => {
    const a = await notesRepo.create({ projectId: "p", title: "A" } as never);
    const b = await notesRepo.create({ projectId: "p", title: "B" } as never);
    await promoteNote(a.id, "spec");
    const second = await promoteNote(b.id, "spec");
    expect((await db.specs.get(second!.id))?.number).toBe("RFC-002");
  });

  it("returns null for a missing note and writes nothing", async () => {
    expect(await promoteNote("nope", "task")).toBeNull();
    expect(await db.tasks.count()).toBe(0);
  });
});
