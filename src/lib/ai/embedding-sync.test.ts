import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { notesRepo } from "@/lib/db/repos";
import { reindexProject } from "./embedding-sync";

const PROJECT_ID = "p1";

interface CapturedSync {
  projectId: string;
  items: { id: string }[];
  allIds: string[];
}

function mockFetch(): CapturedSync[] {
  const syncCalls: CapturedSync[] = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/python/health") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url === "/api/python/embeddings") {
      const body = JSON.parse(String(init?.body ?? "{}")) as CapturedSync;
      syncCalls.push(body);
      return new Response(JSON.stringify({ ok: true, enqueued: body.items.length }), {
        status: 202,
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as unknown as typeof global.fetch;
  return syncCalls;
}

const realFetch = global.fetch;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(() => {
  global.fetch = realFetch;
  vi.resetModules();
});

describe("reindexProject — hash-skip sync", () => {
  it("sends a changed item on first sync, then only reconciles (empty items) once unchanged", async () => {
    const note = await notesRepo.create({
      projectId: PROJECT_ID,
      title: "Auth notes",
      body: "JWT tokens and refresh rotation.",
    });
    const syncCalls = mockFetch();

    await reindexProject(PROJECT_ID);
    expect(syncCalls).toHaveLength(1);
    expect(syncCalls[0].items.map((i) => i.id)).toEqual([note.id]);
    expect(syncCalls[0].allIds).toEqual([note.id]);

    await reindexProject(PROJECT_ID);
    expect(syncCalls).toHaveLength(2);
    // Content unchanged since the first sync — nothing to re-embed, but the
    // full id set is still sent so the service can reconcile deletions.
    expect(syncCalls[1].items).toEqual([]);
    expect(syncCalls[1].allIds).toEqual([note.id]);
  });

  it("resends an item once its content changes", async () => {
    const note = await notesRepo.create({
      projectId: PROJECT_ID,
      title: "Auth notes",
      body: "Original body.",
    });
    const syncCalls = mockFetch();

    await reindexProject(PROJECT_ID);
    expect(syncCalls[0].items.map((i) => i.id)).toEqual([note.id]);

    await notesRepo.update(note.id, { body: "Updated body." });
    await reindexProject(PROJECT_ID);
    expect(syncCalls[1].items.map((i) => i.id)).toEqual([note.id]);
  });

  it("never throws when the local AI service is unreachable", async () => {
    await notesRepo.create({ projectId: PROJECT_ID, title: "N", body: "b" });
    global.fetch = vi.fn(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof global.fetch;

    await expect(reindexProject(PROJECT_ID)).resolves.toBeUndefined();
  });
});
