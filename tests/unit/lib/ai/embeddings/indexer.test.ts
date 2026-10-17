import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { notesRepo } from "@/lib/db/repos";
import { reindexProject } from "@/lib/ai/embeddings/indexer";

const embed = vi.fn(async (texts: string[]) => texts.map((t) => new Float32Array([t.length, 1, 0])));
const deps = () => ({ embed });

beforeEach(async () => {
  embed.mockClear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("reindexProject", () => {
  it("embeds new items, skips unchanged ones, re-embeds edits and removes deletions", async () => {
    const n = await notesRepo.create({ projectId: "p1", title: "Auth", body: "JWT refresh rotation." });
    const r1 = await reindexProject("p1", deps());
    expect(r1).toMatchObject({ added: 1, removed: 0 });
    expect(await db.embeddings.where("projectId").equals("p1").count()).toBe(1);

    embed.mockClear();
    const r2 = await reindexProject("p1", deps());
    expect(r2).toMatchObject({ added: 0, removed: 0, unchanged: 1 });
    expect(embed).not.toHaveBeenCalled();

    await notesRepo.update(n.id, { body: "JWT refresh rotation, now with revocation." });
    const r3 = await reindexProject("p1", deps());
    expect(r3).toMatchObject({ added: 1, removed: 1 });

    await notesRepo.remove(n.id);
    const r4 = await reindexProject("p1", deps());
    expect(r4).toMatchObject({ added: 0, removed: 1 });
    expect(await db.embeddings.where("projectId").equals("p1").count()).toBe(0);
  });
  it("never touches another project's vectors", async () => {
    await notesRepo.create({ projectId: "p1", title: "One", body: "a" });
    await notesRepo.create({ projectId: "p2", title: "Two", body: "b" });
    await reindexProject("p1", deps());
    await reindexProject("p2", deps());
    await reindexProject("p1", deps());
    expect(await db.embeddings.where("projectId").equals("p2").count()).toBe(1);
  });
  it("splits long bodies into several chunks with stable ids", async () => {
    await notesRepo.create({ projectId: "p1", title: "Long", body: Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ${"word ".repeat(40)}`).join("\n\n") });
    await reindexProject("p1", deps());
    const rows = await db.embeddings.where("projectId").equals("p1").toArray();
    expect(rows.length).toBeGreaterThan(3);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.id.startsWith("p1:note:"))).toBe(true);
  });
});
