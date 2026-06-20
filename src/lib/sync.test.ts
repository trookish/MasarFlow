import { describe, it, expect } from "vitest";
import {
  hashContent,
  reconcile,
  summarize,
  buildDesiredFiles,
  type DesiredFile,
} from "./sync";
import type { Note, Doc, SyncFile } from "@/lib/db/schema";

function note(id: string, title: string, body = ""): Note {
  return {
    id,
    projectId: "p",
    type: "note",
    title,
    body,
    excerpt: "",
    tags: [],
    folderId: null,
    createdAt: 0,
    updatedAt: 0,
  };
}
function doc(id: string, title: string, body = ""): Doc {
  return {
    id,
    projectId: "p",
    title,
    slug: title.toLowerCase(),
    category: "general",
    body,
    sourceType: "manual",
    createdAt: 0,
    updatedAt: 0,
  };
}
function existing(p: Partial<SyncFile> & Pick<SyncFile, "entityId" | "hash">): SyncFile {
  return {
    id: `s-${p.entityId}`,
    projectId: "p",
    path: "x.md",
    mtime: 0,
    status: "synced",
    entityType: "note",
    lastSyncedAt: 1,
    ...p,
  };
}

describe("hashContent", () => {
  it("is deterministic and content-sensitive", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
    expect(hashContent("hello")).not.toBe(hashContent("hello!"));
    expect(hashContent("")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("buildDesiredFiles", () => {
  it("maps notes and docs to vault paths, sorted", () => {
    const files = buildDesiredFiles([note("n1", "Alpha")], [doc("d1", "Beta")]);
    expect(files.map((f) => f.path)).toEqual([
      "docs/general/beta.md",
      "notes/alpha.md",
    ]);
    expect(files.every((f) => /^[0-9a-f]{8}$/.test(f.hash))).toBe(true);
  });
});

describe("reconcile", () => {
  const desired: DesiredFile[] = [
    { path: "notes/a.md", hash: "aaaa", entityType: "note", entityId: "n1" },
  ];

  it("marks files with no prior record as new", () => {
    expect(reconcile(desired, [])[0].status).toBe("new");
  });

  it("marks unchanged + previously-synced files as synced", () => {
    const ex = [existing({ entityId: "n1", hash: "aaaa", lastSyncedAt: 100 })];
    expect(reconcile(desired, ex)[0].status).toBe("synced");
  });

  it("marks changed files as local_modified", () => {
    const ex = [existing({ entityId: "n1", hash: "bbbb", lastSyncedAt: 100 })];
    expect(reconcile(desired, ex)[0].status).toBe("local_modified");
  });

  it("treats unchanged-but-never-synced files as new", () => {
    const ex = [existing({ entityId: "n1", hash: "aaaa", lastSyncedAt: null })];
    expect(reconcile(desired, ex)[0].status).toBe("new");
  });

  it("drops orphaned records whose entity no longer exists", () => {
    const ex = [
      existing({ entityId: "n1", hash: "aaaa", lastSyncedAt: 1 }),
      existing({ entityId: "gone", hash: "zzzz", lastSyncedAt: 1 }),
    ];
    const out = reconcile(desired, ex);
    expect(out).toHaveLength(1);
    expect(out[0].entityId).toBe("n1");
  });
});

describe("summarize", () => {
  it("counts files by status", () => {
    const counts = summarize([
      { status: "new" },
      { status: "new" },
      { status: "synced" },
    ]);
    expect(counts.new).toBe(2);
    expect(counts.synced).toBe(1);
    expect(counts.conflict).toBe(0);
  });
});
