import { describe, expect, it } from "vitest";
import type { Doc, Folder, Note, Spec, Task } from "@/lib/db/schema";
import {
  VaultPathError,
  assertRelativeVaultPath,
  claimOf,
  fileSegment,
  folderChain,
  isMirroredPath,
  joinVaultPath,
  pathFor,
  uniquePaths,
} from "@/lib/vault/paths";

const note = (over: Partial<Note> = {}): Note => ({
  id: "n1", projectId: "p1", type: "note", title: "Auth design", body: "",
  excerpt: "", tags: [], folderId: null, createdAt: 0, updatedAt: 0, ...over,
});
const doc = (over: Partial<Doc> = {}): Doc => ({
  id: "d1", projectId: "p1", title: "Setup guide", slug: "setup-guide",
  category: "guides", body: "", sourceType: "manual", createdAt: 0, updatedAt: 0, ...over,
});
const spec = (over: Partial<Spec> = {}): Spec => ({
  id: "s1", projectId: "p1", number: "RFC-001", title: "Auth flow", status: "draft",
  purpose: "", goals: [], features: [], constraints: [], dependencies: [], acceptance: [],
  risks: [], futureImprovements: [], technicalNotes: "", implementationProgress: 0,
  linkedNoteIds: [], linkedTaskIds: [], createdAt: 0, updatedAt: 0, ...over,
});
const task = (over: Partial<Task> = {}): Task => ({
  id: "t1", projectId: "p1", title: "Fix login", description: "", status: "backlog",
  priority: "medium", specId: null, sprintId: null, parentTaskId: null, assignee: "human",
  dependencies: [], progress: 0, tags: [], externalRef: "", dueDate: null, createdAt: 0, updatedAt: 0, ...over,
});

describe("fileSegment", () => {
  it("keeps unicode letters and strips path-hostile characters", () => {
    expect(fileSegment("Auth design")).toBe("Auth design");
    expect(fileSegment("تصميم المصادقة")).toBe("تصميم المصادقة");
    expect(fileSegment('a/b:c*d?e"f<g>h|i')).toBe("a b c d e f g h i");
    expect(fileSegment("trailing dot.")).toBe("trailing dot");
    expect(fileSegment("   ")).toBe("untitled");
    expect(fileSegment("x".repeat(120))).toHaveLength(64);
  });
});

describe("assertRelativeVaultPath", () => {
  it("accepts normal mirror paths", () => {
    expect(assertRelativeVaultPath("notes/auth design.md")).toBe("notes/auth design.md");
    expect(assertRelativeVaultPath("docs/guides/setup.md")).toBe("docs/guides/setup.md");
  });
  it("rejects everything that could escape the mirror folder", () => {
    for (const bad of ["", "/abs.md", "C:/x.md", "..\\x.md", "a/../b.md", "a//b.md", "a/./b.md", "a\\b.md"]) {
      expect(() => assertRelativeVaultPath(bad), bad).toThrow(VaultPathError);
    }
    expect(() => assertRelativeVaultPath(`notes/${"x".repeat(300)}.md`)).toThrow(VaultPathError);
  });
});

describe("joinVaultPath", () => {
  it("joins and normalises", () => {
    expect(joinVaultPath("MasarFlow/p1", "notes", "a.md")).toBe("MasarFlow/p1/notes/a.md");
    expect(joinVaultPath("MasarFlow//p1/", "/notes/", "a.md")).toBe("MasarFlow/p1/notes/a.md");
  });
});

describe("folderChain", () => {
  const folders: Folder[] = [
    { id: "f1", projectId: "p1", name: "Auth", parentId: null, createdAt: 0, updatedAt: 0 },
    { id: "f2", projectId: "p1", name: "Flows", parentId: "f1", createdAt: 0, updatedAt: 0 },
  ];
  it("builds the nested path, guards cycles and missing parents", () => {
    expect(folderChain(folders, "f2")).toBe("Auth/Flows");
    expect(folderChain(folders, null)).toBeNull();
    expect(folderChain(folders, "ghost")).toBeNull();
    const cyc: Folder[] = [
      { id: "a", projectId: "p1", name: "A", parentId: "b", createdAt: 0, updatedAt: 0 },
      { id: "b", projectId: "p1", name: "B", parentId: "a", createdAt: 0, updatedAt: 0 },
    ];
    expect(folderChain(cyc, "a")).toBe("B/A");
  });
});

describe("pathFor", () => {
  it("maps every mirrored kind", () => {
    expect(pathFor("note", note())).toBe("notes/Auth design.md");
    expect(pathFor("note", note(), "Auth/Flows")).toBe("notes/Auth/Flows/Auth design.md");
    expect(pathFor("doc", doc())).toBe("docs/guides/Setup guide.md");
    expect(pathFor("spec", spec())).toBe("specs/RFC-001-Auth flow.md");
    expect(pathFor("task", task())).toBe("tasks/Fix login.md");
  });
  it("sends notes carrying props.day to daily/", () => {
    expect(pathFor("note", note({ props: { day: "2026-10-16" } }))).toBe("daily/2026-10-16.md");
  });
  it("always produces a guarded, relative path inside a mirror directory", () => {
    const all = [pathFor("note", note()), pathFor("doc", doc()), pathFor("spec", spec()), pathFor("task", task())];
    for (const p of all) {
      expect(assertRelativeVaultPath(p)).toBe(p);
      expect(isMirroredPath(p)).toBe(true);
    }
  });
});

describe("isMirroredPath / claimOf", () => {
  it("claims the four kinds and rejects everything else", () => {
    expect(claimOf("notes/a.md")).toBe("note");
    expect(claimOf("daily/2026-10-16.md")).toBe("note");
    expect(claimOf("docs/x/y.md")).toBe("doc");
    expect(claimOf("specs/RFC-001-a.md")).toBe("spec");
    expect(claimOf("tasks/t.md")).toBe("task");
    expect(claimOf("attachments/pic.png")).toBeNull();
    expect(isMirroredPath("attachments/pic.png")).toBe(false);
    expect(isMirroredPath("notes/a.canvas")).toBe(false);
  });
});

describe("uniquePaths", () => {
  it("de-duplicates case-insensitively with -2, -3 suffixes", () => {
    const out = uniquePaths([
      { kind: "note", id: "a", path: "notes/x.md" },
      { kind: "note", id: "b", path: "notes/X.md" },
      { kind: "note", id: "c", path: "notes/x.md" },
    ]);
    expect(out.map((e) => e.path)).toEqual(["notes/x.md", "notes/X-2.md", "notes/x-3.md"]);
  });
});

describe("windows-hostile paths", () => {
  it("neutralises reserved names in generated segments and rejects them in hand-built paths", () => {
    expect(fileSegment("CON")).toBe("_CON");
    expect(fileSegment("nul")).toBe("_nul");
    expect(fileSegment("COM1")).toBe("_COM1");
    expect(fileSegment("COM10")).toBe("COM10");
    expect(pathFor("note", note({ title: "CON" }))).toBe("notes/_CON.md");
    expect(assertRelativeVaultPath("notes/_CON.md")).toBe("notes/_CON.md");
    expect(() => assertRelativeVaultPath("notes/CON.md")).toThrow(VaultPathError);
    expect(() => assertRelativeVaultPath("notes/nul.md")).toThrow(VaultPathError);
    expect(() => assertRelativeVaultPath("notes/LPT1.md")).toThrow(VaultPathError);
  });

  it("rejects drive letters, backslashes and trailing dot/space segments", () => {
    expect(() => assertRelativeVaultPath("D:/x.md")).toThrow(VaultPathError);
    expect(() => assertRelativeVaultPath("d:x.md")).toThrow(VaultPathError);
    expect(() => assertRelativeVaultPath("notes/a\\b.md")).toThrow(VaultPathError);
    expect(() => assertRelativeVaultPath("notes/a./b.md")).toThrow(VaultPathError);
    expect(() => assertRelativeVaultPath("notes/a /b.md")).toThrow(VaultPathError);
    expect(fileSegment("trailing space ")).toBe("trailing space");
  });
});
