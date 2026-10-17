import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { docsRepo } from "@/lib/db/repos/docs";
import { notesRepo } from "@/lib/db/repos/notes";
import { buildQuickItems, loadQuickItems, rankQuickItems, KIND_LABEL } from "@/lib/vault/quick-switch";

const note = (id: string, title: string, updatedAt: number) => ({
  id, projectId: "p1", type: "note" as const, title, body: "", excerpt: "", tags: ["auth"],
  folderId: null, createdAt: 0, updatedAt,
});

describe("buildQuickItems", () => {
  it("makes one item per entity with a subtitle and a registry href", () => {
    const items = buildQuickItems({
      notes: [note("n1", "Auth design", 5)], docs: [], specs: [], tasks: [],
    });
    expect(items[0]).toMatchObject({ kind: "note", id: "n1", title: "Auth design" });
    expect(items[0].subtitle).toContain(KIND_LABEL.note);
    expect(items[0].href).toBe("/brain?note=n1");
  });

  it("orders by most recently updated", () => {
    const items = buildQuickItems({
      notes: [note("n1", "Older", 1), note("n2", "Newer", 9)], docs: [], specs: [], tasks: [],
    });
    expect(items.map((i) => i.id)).toEqual(["n2", "n1"]);
  });
});

describe("rankQuickItems", () => {
  const items = buildQuickItems({ notes: [note("n1", "Auth design", 5), note("n2", "Deploy runbook", 4)], docs: [], specs: [], tasks: [] });

  it("returns the most recent items for an empty query, capped by the limit", () => {
    expect(rankQuickItems(items, "", 1).map((i) => i.id)).toEqual(["n1"]);
  });

  it("matches fuzzily and ignores word position", () => {
    expect(rankQuickItems(items, "ath d", 5).map((i) => i.id)).toEqual(["n1"]);
    expect(rankQuickItems(items, "runbook", 5).map((i) => i.id)).toEqual(["n2"]);
    expect(rankQuickItems(items, "zzzz", 5)).toEqual([]);
  });
});

describe("loadQuickItems", () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.docs.clear();
  });

  it("loads all four kinds for the project", async () => {
    await notesRepo.create({ id: "n1", projectId: "p1", title: "Auth design", body: "", tags: [] });
    await docsRepo.create({ id: "d1", projectId: "p1", title: "Setup guide", body: "" });
    const items = await loadQuickItems("p1");
    expect(items.map((i) => [i.kind, i.id])).toEqual([["doc", "d1"], ["note", "n1"]]);
  });
});
