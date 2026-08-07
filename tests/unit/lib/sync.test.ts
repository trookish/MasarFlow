import { describe, it, expect } from "vitest";
import {
  hashContent,
  reconcile,
  summarize,
  buildDesiredFiles,
  normalizeMd,
  parseFrontmatter,
  classifyRemoteStatus,
  serializeNote,
  fileExtension,
  isObsidianFile,
  isBinaryFile,
  getMimeType,
  type DesiredFile,
} from "@/lib/sync";
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
  it("maps notes and docs to default vault paths when no sync records exist", () => {
    const files = buildDesiredFiles([note("n1", "Alpha")], [doc("d1", "Beta")]);
    expect(files.map((f) => f.path)).toEqual([
      "docs/general/beta.md",
      "notes/alpha.md",
    ]);
    expect(files.every((f) => /^[0-9a-f]{8}$/.test(f.hash))).toBe(true);
  });

  it("preserves previously-imported vault paths from existing sync records", () => {
    const syncRecords: SyncFile[] = [
      existing({ entityId: "n1", hash: "aaaa", path: "my-custom-folder/alpha.md" }),
      existing({ entityId: "d1", hash: "bbbb", path: "project-docs/beta.md" }),
    ];
    const files = buildDesiredFiles(
      [note("n1", "Alpha")],
      [doc("d1", "Beta")],
      syncRecords,
    );
    expect(files.map((f) => f.path)).toEqual([
      "my-custom-folder/alpha.md",
      "project-docs/beta.md",
    ]);
  });

  it("uses default paths for new entities not in sync records", () => {
    const syncRecords: SyncFile[] = [
      existing({ entityId: "n1", hash: "aaaa", path: "imported/alpha.md" }),
    ];
    const files = buildDesiredFiles(
      [note("n1", "Alpha"), note("n2", "Gamma")],
      [doc("d1", "Beta")],
      syncRecords,
    );
    // n1 preserves imported path, n2 and d1 get defaults
    const pathMap = new Map(files.map((f) => [f.entityId, f.path]));
    expect(pathMap.get("n1")).toBe("imported/alpha.md");
    expect(pathMap.get("n2")).toBe("notes/gamma.md");
    expect(pathMap.get("d1")).toBe("docs/general/beta.md");
  });
});

describe("fileExtension", () => {
  it("extracts lowercase extensions", () => {
    expect(fileExtension("photo.PNG")).toBe("png");
    expect(fileExtension("path/to/file.canvas")).toBe("canvas");
    expect(fileExtension("Makefile")).toBe("");
    expect(fileExtension(".gitignore")).toBe("");
  });
});

describe("isObsidianFile", () => {
  it("accepts all Obsidian-native file types", () => {
    expect(isObsidianFile("note.md")).toBe(true);
    expect(isObsidianFile("board.canvas")).toBe(true);
    expect(isObsidianFile("photo.png")).toBe(true);
    expect(isObsidianFile("photo.jpg")).toBe(true);
    expect(isObsidianFile("photo.svg")).toBe(true);
    expect(isObsidianFile("photo.webp")).toBe(true);
    expect(isObsidianFile("doc.pdf")).toBe(true);
    expect(isObsidianFile("song.mp3")).toBe(true);
    expect(isObsidianFile("clip.mp4")).toBe(true);
    expect(isObsidianFile("clip.wav")).toBe(true);
  });

  it("rejects non-Obsidian extensions", () => {
    expect(isObsidianFile("code.py")).toBe(false);
    expect(isObsidianFile("data.json")).toBe(false);
    expect(isObsidianFile("Makefile")).toBe(false);
  });
});

describe("isBinaryFile", () => {
  it("classifies images, audio, video, PDF as binary", () => {
    expect(isBinaryFile("photo.png")).toBe(true);
    expect(isBinaryFile("song.mp3")).toBe(true);
    expect(isBinaryFile("clip.mp4")).toBe(true);
    expect(isBinaryFile("doc.pdf")).toBe(true);
  });

  it("classifies markdown and canvas as non-binary", () => {
    expect(isBinaryFile("note.md")).toBe(false);
    expect(isBinaryFile("board.canvas")).toBe(false);
  });
});

describe("getMimeType", () => {
  it("returns correct MIME types", () => {
    expect(getMimeType("file.md")).toBe("text/markdown");
    expect(getMimeType("file.png")).toBe("image/png");
    expect(getMimeType("file.pdf")).toBe("application/pdf");
    expect(getMimeType("file.canvas")).toBe("application/json");
    expect(getMimeType("file.mp3")).toBe("audio/mpeg");
    expect(getMimeType("unknown.xyz")).toBe("application/octet-stream");
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

describe("normalizeMd", () => {
  it("ignores CRLF and edge whitespace for comparison", () => {
    expect(normalizeMd("a\r\nb\n\n")).toBe(normalizeMd("a\nb"));
    expect(hashContent(normalizeMd("x\r\n"))).toBe(hashContent(normalizeMd("x")));
  });
});

describe("parseFrontmatter round-trips serializeNote", () => {
  it("recovers title, type, tags, and body", () => {
    const n = note("n1", "My Note", "Line one\nLine two");
    n.type = "idea";
    n.tags = ["alpha", "beta"];
    const { fields, body } = parseFrontmatter(serializeNote(n));
    expect(fields.title).toBe("My Note");
    expect(fields.type).toBe("idea");
    expect(fields.tags).toBe("alpha, beta");
    expect(body).toBe("Line one\nLine two");
  });

  it("handles markdown without frontmatter", () => {
    const { fields, body } = parseFrontmatter("just body text");
    expect(fields).toEqual({});
    expect(body).toBe("just body text");
  });
});

describe("classifyRemoteStatus", () => {
  it("is new when the remote file is absent", () => {
    expect(classifyRemoteStatus("a", null, "a", true)).toBe("new");
  });
  it("is synced when local equals remote", () => {
    expect(classifyRemoteStatus("a", "a", "x", true)).toBe("synced");
  });
  it("is local_modified when only local diverged from base", () => {
    expect(classifyRemoteStatus("b", "a", "a", true)).toBe("local_modified");
  });
  it("is remote_modified when only remote diverged from base", () => {
    expect(classifyRemoteStatus("a", "b", "a", true)).toBe("remote_modified");
  });
  it("is conflict when both diverged from base", () => {
    expect(classifyRemoteStatus("b", "c", "a", true)).toBe("conflict");
  });
  it("is conflict when content differs but there is no sync base", () => {
    expect(classifyRemoteStatus("a", "b", null, false)).toBe("conflict");
  });
});
