import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { devLogsRepo, notesRepo, tasksRepo } from "@/lib/db/repos";
import { buildSearchItems } from "@/lib/utils/search";
import { entityHref } from "@/lib/entities/registry";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("buildSearchItems hrefs", () => {
  it("come from the entity registry, including dev logs", async () => {
    const note = await notesRepo.create({ projectId: "p1", title: "N", body: "b" });
    const task = await tasksRepo.create({ projectId: "p1", title: "T" });
    const log = await devLogsRepo.create({ projectId: "p1", title: "L" });
    const items = await buildSearchItems("p1");
    const hrefOf = (kind: string, id: string) => items.find((i) => i.kind === kind && i.id === id)?.href;
    expect(hrefOf("note", note.id)).toBe(entityHref({ kind: "note", id: note.id }));
    expect(hrefOf("task", task.id)).toBe(entityHref({ kind: "task", id: task.id }));
    expect(hrefOf("devlog", log.id)).toBe(entityHref({ kind: "devlog", id: log.id }));
  });
});
