import { describe, expect, it } from "vitest";
import type { SyncFile } from "@/lib/db/schema";
import {
  collectLocal,
  indexRowFor,
  planVaultSync,
  resolveNextRow,
  type MirrorEntity,
  type MirrorFile,
} from "@/lib/vault/plan";
import { noteRow, specRow, taskRow } from "./_fixtures";

const ent = (over: Partial<MirrorEntity> = {}): MirrorEntity => ({
  kind: "note", id: "n1", path: "notes/a.md", hash: "H1", baseHash: null, status: null, ...over,
});
const file = (over: Partial<MirrorFile> = {}): MirrorFile => ({
  path: "notes/a.md", hash: "H1", msfId: null, ...over,
});
const row = (over: Partial<SyncFile> = {}): SyncFile => ({
  id: "r1", projectId: "p1", path: "notes/a.md", hash: "H1", mtime: 0,
  status: "synced", entityType: "note", entityId: "n1", lastSyncedAt: 5, ...over,
});

const only = (a: ReturnType<typeof planVaultSync>) =>
  a.filter((x) => "path" in x && x.path === "notes/a.md");

describe("collectLocal", () => {
  it("maps every kind to its natural path, hashes the content and keeps the record for the index", () => {
    const { entities, contentByKey } = collectLocal({
      notes: [noteRow({ id: "n1", title: "Auth design" })],
      docs: [], specs: [specRow({ id: "s1" })], tasks: [taskRow({ id: "t1" })], folders: [],
      index: [], projectSlug: "p1",
    });
    expect(entities.map((e) => [e.kind, e.id, e.path])).toEqual([
      ["note", "n1", "notes/Auth design.md"],
      ["spec", "s1", "specs/RFC-001-Auth flow.md"],
      ["task", "t1", "tasks/Fix login.md"],
    ]);
    expect(entities[0].hash).toMatch(/^[0-9a-f]{8}$/);
    expect(contentByKey.get("note:n1")).toContain("msf_id: n1");
    expect(entities[0].status).toBeNull();
  });

  it("keeps the recorded path when the title changed (a rename never renames the file)", () => {
    const { entities } = collectLocal({
      notes: [noteRow({ id: "n1", title: "New name" })], docs: [], specs: [], tasks: [], folders: [],
      index: [row({ path: "notes/old name.md", entityId: "n1" })], projectSlug: "p1",
    });
    expect(entities[0].path).toBe("notes/old name.md");
    expect(entities[0].baseHash).toBe("H1");
    expect(entities[0].status).toBe("synced");
  });

  it("de-duplicates colliding paths and puts daily notes in daily/", () => {
    const { entities } = collectLocal({
      notes: [
        noteRow({ id: "n1", title: "Same" }),
        noteRow({ id: "n2", title: "Same" }),
        noteRow({ id: "n3", title: "2026-10-16", props: { day: "2026-10-16" } }),
      ],
      docs: [], specs: [], tasks: [], folders: [], index: [], projectSlug: "p1",
    });
    expect(entities.map((e) => e.path)).toEqual(["notes/Same.md", "notes/Same-2.md", "daily/2026-10-16.md"]);
  });

  it("uses the note's folder chain", () => {
    const { entities } = collectLocal({
      notes: [noteRow({ id: "n1", title: "N", folderId: "f2" })], docs: [], specs: [], tasks: [],
      folders: [
        { id: "f1", projectId: "p1", name: "Auth", parentId: null, createdAt: 0, updatedAt: 0 },
        { id: "f2", projectId: "p1", name: "Flows", parentId: "f1", createdAt: 0, updatedAt: 0 },
      ],
      index: [], projectSlug: "p1",
    });
    expect(entities[0].path).toBe("notes/Auth/Flows/N.md");
  });
});

describe("planVaultSync — the policy matrix", () => {
  it("creates a file for a brand-new entity", () => {
    expect(only(planVaultSync({ entities: [ent()], files: [], autoImport: true }))).toEqual([
      { action: "write", path: "notes/a.md", kind: "note", entityId: "n1", reason: "create" },
    ]);
  });

  it("skips when the file already matches", () => {
    const actions = only(planVaultSync({ entities: [ent({ hash: "H1", baseHash: "H1", status: "synced" })], files: [file()], autoImport: true }));
    expect(actions).toEqual([{ action: "skip", path: "notes/a.md", kind: "note", entityId: "n1", status: "synced" }]);
  });

  it("writes when only the app changed (file still at base)", () => {
    const actions = only(planVaultSync({ entities: [ent({ hash: "H2", baseHash: "H1", status: "synced" })], files: [file()], autoImport: false }));
    expect(actions).toEqual([{ action: "write", path: "notes/a.md", kind: "note", entityId: "n1", reason: "update" }]);
  });

  it("imports when only the file changed (verify-before-overwrite), flagged by autoImport", () => {
    for (const auto of [true, false]) {
      const actions = only(planVaultSync({ entities: [ent({ hash: "H1", baseHash: "H1", status: "synced" })], files: [file({ hash: "H9" })], autoImport: auto }));
      expect(actions).toEqual([{ action: "import", path: "notes/a.md", kind: "note", entityId: "n1", auto }]);
    }
  });

  it("NEVER writes when both sides changed", () => {
    const actions = only(planVaultSync({ entities: [ent({ hash: "H2", baseHash: "H1", status: "synced" })], files: [file({ hash: "H9" })], autoImport: true }));
    expect(actions).toEqual([{ action: "conflict", path: "notes/a.md", kind: "note", entityId: "n1", baseHash: "H1" }]);
    expect(actions.some((a) => a.action === "write" || a.action === "import")).toBe(false);
  });

  it("NEVER overwrites a foreign file that happens to sit at our path (no base)", () => {
    const actions = only(planVaultSync({ entities: [ent({ hash: "H1" })], files: [file({ hash: "USER" })], autoImport: true }));
    expect(actions).toEqual([{ action: "conflict", path: "notes/a.md", kind: "note", entityId: "n1", baseHash: null }]);
  });

  it("reports a file deleted outside the app once, then stays quiet", () => {
    const first = only(planVaultSync({ entities: [ent({ hash: "H1", baseHash: "H1", status: "synced" })], files: [], autoImport: true }));
    expect(first).toEqual([{ action: "missing", path: "notes/a.md", kind: "note", entityId: "n1" }]);
    const second = only(planVaultSync({ entities: [ent({ hash: "", baseHash: null, status: "deleted" })], files: [], autoImport: true }));
    expect(second).toEqual([{ action: "skip", path: "notes/a.md", kind: "note", entityId: "n1", status: "deleted" }]);
  });

  it("re-creates the file for an entity that was never synced at all", () => {
    const actions = only(planVaultSync({ entities: [ent({ hash: "H1", baseHash: null, status: null })], files: [], autoImport: true }));
    expect(actions[0]).toEqual({ action: "write", path: "notes/a.md", kind: "note", entityId: "n1", reason: "create" });
  });

  it("adopts a file the user moved (msf_id match): repath + the normal decision at the new path", () => {
    const moved = [file({ path: "notes/moved.md", hash: "H9", msfId: "n1" })];
    expect(only2(planVaultSync({ entities: [ent({ hash: "H1", baseHash: "H1", status: "synced" })], files: moved, autoImport: true }), "notes/moved.md")).toEqual([
      { action: "repath", from: "notes/a.md", to: "notes/moved.md", kind: "note", entityId: "n1", import: false },
      { action: "import", path: "notes/moved.md", kind: "note", entityId: "n1", auto: true },
    ]);
    const unchanged = [file({ path: "notes/moved.md", hash: "H1", msfId: "n1" })];
    expect(only2(planVaultSync({ entities: [ent({ hash: "H1", baseHash: "H1", status: "synced" })], files: unchanged, autoImport: true }), "notes/moved.md")).toEqual([
      { action: "repath", from: "notes/a.md", to: "notes/moved.md", kind: "note", entityId: "n1", import: false },
      { action: "skip", path: "notes/moved.md", kind: "note", entityId: "n1", status: "synced" },
    ]);
  });

  it("never touches an unreadable file (truncated/binary) and surfaces it as a conflict", () => {
    const actions = only(planVaultSync({ entities: [ent({ hash: "H2", baseHash: "H1", status: "synced" })], files: [file({ hash: null })], autoImport: true }));
    expect(actions).toEqual([{ action: "blocked", path: "notes/a.md", kind: "note", entityId: "n1" }]);
  });

  it("lists unknown files as adoptable and ignores everything else", () => {
    const actions = planVaultSync({
      entities: [ent({ hash: "H1", baseHash: "H1", status: "synced" })], autoImport: true,
      files: [file({ hash: "H1" }), file({ path: "notes/fresh.md", hash: "X" }), file({ path: "attachments/pic.png", hash: "X", msfId: null })],
    });
    expect(actions.filter((a) => a.action === "external" || a.action === "ignore")).toEqual([
      { action: "ignore", path: "attachments/pic.png" },
      { action: "external", path: "notes/fresh.md" },
    ]);
  });

  it("keeps a file that claims the id of a dead entity as adoptable (never resurrects silently)", () => {
    const actions = planVaultSync({ entities: [], files: [file({ msfId: "ghost", path: "notes/ghost.md" })], autoImport: true });
    expect(actions).toEqual([{ action: "external", path: "notes/ghost.md" }]);
  });

  it("is deterministic (sorted by path) and always path-guarded", () => {
    const actions = planVaultSync({
      entities: [ent({ id: "b", path: "notes/b.md", hash: "H1" }), ent({ id: "a", path: "notes/a.md", hash: "H1" })],
      files: [], autoImport: true,
    });
    expect(actions.map((a) => ("path" in a ? a.path : a.to))).toEqual(["notes/a.md", "notes/b.md"]);
    for (const a of actions) {
      const p = "path" in a ? a.path : a.to;
      expect(p.startsWith("/") || p.includes("..")).toBe(false);
    }
  });
});

function only2(actions: ReturnType<typeof planVaultSync>, path: string) {
  return actions.filter(
    (a) => ("path" in a && a.path === path) || (a.action === "repath" && a.to === path),
  );
}

describe("indexRowFor", () => {
  const entity = ent({ hash: "H2", baseHash: "H1", status: "synced" });
  it("records successful writes and imports as synced", () => {
    expect(indexRowFor({ action: "write", path: "notes/a.md", kind: "note", entityId: "n1", reason: "update" }, entity, null, 100)).toEqual(
      { path: "notes/a.md", hash: "H2", status: "synced", entityType: "note", entityId: "n1", lastSyncedAt: 100 },
    );
    expect(indexRowFor({ action: "import", path: "notes/a.md", kind: "note", entityId: "n1", auto: false }, entity, "H9", 100)).toEqual(
      { path: "notes/a.md", hash: "H9", status: "synced", entityType: "note", entityId: "n1", lastSyncedAt: 100 },
    );
  });
  it("keeps the base hash on conflicts so nothing is lost, and marks deletions", () => {
    expect(indexRowFor({ action: "conflict", path: "notes/a.md", kind: "note", entityId: "n1", baseHash: "H1" }, entity, "H9", 100)).toEqual(
      { path: "notes/a.md", hash: "H1", status: "conflict", entityType: "note", entityId: "n1", lastSyncedAt: null },
    );
    expect(indexRowFor({ action: "missing", path: "notes/a.md", kind: "note", entityId: "n1" }, entity, null, 100)).toEqual(
      { path: "notes/a.md", hash: "", status: "deleted", entityType: "note", entityId: "n1", lastSyncedAt: null },
    );
  });
  it("has no row for an import that could not be read or for foreign files", () => {
    expect(indexRowFor({ action: "import", path: "notes/a.md", kind: "note", entityId: "n1", auto: false }, entity, null, 100)).toBeNull();
    expect(indexRowFor({ action: "external", path: "notes/x.md" }, undefined, "X", 100)).toBeNull();
  });
});

describe("resolveNextRow (user conflict choices)", () => {
  const conflictRow = row({ hash: "H1", status: "conflict", lastSyncedAt: 5 });
  it("'keep app' adopts the file's current hash as base so the next run may overwrite", () => {
    expect(resolveNextRow(conflictRow, "H9", "app", 100)).toMatchObject({ hash: "H9", status: "local_modified", lastSyncedAt: 100 });
  });
  it("'keep file' marks it synced with the file's hash (the caller imports the content)", () => {
    expect(resolveNextRow(conflictRow, "H9", "file", 100)).toMatchObject({ hash: "H9", status: "synced", lastSyncedAt: 100 });
  });
  it("'recreate' forgets the file so the next run creates it again", () => {
    expect(resolveNextRow(row({ status: "deleted", hash: "" }), null, "recreate", 100)).toMatchObject({ hash: "", status: "new", lastSyncedAt: null });
  });
});
