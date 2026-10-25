import "fake-indexeddb/auto";
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { notesRepo } from "@/lib/db/repos/notes";
import { syncRepo } from "@/lib/db/repos/sync";
import { removeEntity } from "@/lib/domain/commands";
import { makeFakeIO } from "./_helpers/fake-io";
import { runVaultSync, resolveVaultConflict, type VaultDeps } from "@/lib/vault/engine";
import { scratchDir, removeDir, tmpList, tmpRead } from "../../_helpers/scratch";

const FOLDER = "MasarFlow/p1";

async function seed(projectId = "p1"): Promise<void> {
  await db.notes.clear();
  await db.syncFiles.clear();
  await db.trash.clear();
  await db.links.clear();
  await notesRepo.create({ id: "n1", projectId, title: "Auth design", body: "JWT everywhere", tags: ["auth"] });
  await notesRepo.create({ id: "n2", projectId, title: "Deploy", body: "docker compose", tags: [] });
}

function deps(io: VaultDeps["io"], over: Partial<VaultDeps> = {}): VaultDeps {
  return { io, root: "C:/vault", folder: FOLDER, projectId: "p1", projectSlug: "p1", autoImport: true, now: () => 1000, ...over };
}

const keyOf = (folder: string, rel: string): string => `${folder}/${rel}`;

describe("runVaultSync", () => {
  beforeEach(async () => {
    await seed();
  });

  it("run 1 writes every note as markdown and records the index", async () => {
    const { io, files } = makeFakeIO();
    const summary = await runVaultSync(deps(io));
    expect(summary.written).toBe(2);
    expect(files.has(keyOf(FOLDER, "notes/Auth design.md"))).toBe(true);
    expect(files.get(keyOf(FOLDER, "notes/Auth design.md"))).toContain("JWT everywhere");
    const rows = await syncRepo.listByProject("p1");
    expect(rows.map((r) => [r.path, r.status, r.entityId])).toEqual([
      ["notes/Auth design.md", "synced", "n1"],
      ["notes/Deploy.md", "synced", "n2"],
    ]);
  });

  it("run 2 is a no-op (idempotent)", async () => {
    const { io, files } = makeFakeIO();
    await runVaultSync(deps(io));
    const before = [...files.entries()];
    const summary = await runVaultSync(deps(io));
    expect(summary.written).toBe(0);
    expect(summary.imported).toBe(0);
    expect([...files.entries()]).toEqual(before);
  });

  it("writes only what the app changed", async () => {
    const { io, files } = makeFakeIO();
    await runVaultSync(deps(io));
    await notesRepo.update("n1", { body: "rotating keys" });
    const summary = await runVaultSync(deps(io));
    expect(summary.written).toBe(1);
    expect(files.get(keyOf(FOLDER, "notes/Auth design.md"))).toContain("rotating keys");
    expect(files.get(keyOf(FOLDER, "notes/Deploy.md"))).toContain("docker compose");
  });

  it("imports a file the user edited (verify-before-overwrite) and leaves the file byte-identical", async () => {
    const { io, files } = makeFakeIO();
    await runVaultSync(deps(io));
    const path = keyOf(FOLDER, "notes/Deploy.md");
    const edited = files.get(path)!.replace("docker compose", "docker compose + k8s");
    files.set(path, edited);
    const summary = await runVaultSync(deps(io));
    expect(summary.imported).toBe(1);
    expect(summary.written).toBe(0);
    expect(files.get(path)).toBe(edited);
    expect((await notesRepo.get("n2"))?.body).toBe("docker compose + k8s");
  });

  it("reports (and never resolves) an edit that collides with an app edit", async () => {
    const { io, files } = makeFakeIO();
    await runVaultSync(deps(io));
    const path = keyOf(FOLDER, "notes/Deploy.md");
    files.set(path, files.get(path)!.replace("docker compose", "USER VERSION"));
    await notesRepo.update("n2", { body: "APP VERSION" });
    const summary = await runVaultSync(deps(io));
    expect(summary.conflicts).toBe(1);
    expect(files.get(path)).toContain("USER VERSION");
    expect((await notesRepo.get("n2"))?.body).toBe("APP VERSION");
    expect((await syncRepo.listByProject("p1")).find((r) => r.entityId === "n2")?.status).toBe("conflict");
  });

  it("resolves a conflict on request: keep app overwrites, keep file imports", async () => {
    const { io, files } = makeFakeIO();
    await runVaultSync(deps(io));
    const path = keyOf(FOLDER, "notes/Deploy.md");
    files.set(path, "USER VERSION");
    await notesRepo.update("n2", { body: "APP VERSION" });
    await runVaultSync(deps(io));

    await resolveVaultConflict(deps(io), "n2", "app");
    const afterApp = await runVaultSync(deps(io));
    expect(afterApp.written).toBe(1);
    expect(files.get(path)).toContain("APP VERSION");

    files.set(path, "USER AGAIN");
    await runVaultSync(deps(io));
    await resolveVaultConflict(deps(io), "n2", "file");
    expect((await notesRepo.get("n2"))?.body).toBe("USER AGAIN");
  });

  it("never re-creates a file the user deleted; 'recreate' does", async () => {
    const { io, files } = makeFakeIO();
    await runVaultSync(deps(io));
    const path = keyOf(FOLDER, "notes/Deploy.md");
    files.delete(path);
    const summary = await runVaultSync(deps(io));
    expect(summary.missing).toBe(1);
    expect(summary.written).toBe(0);
    expect(files.has(path)).toBe(false);
    await resolveVaultConflict(deps(io), "n2", "recreate");
    const again = await runVaultSync(deps(io));
    expect(again.written).toBe(1);
    expect(files.has(path)).toBe(true);
  });

  it("adopts a file the user moved instead of duplicating it", async () => {
    const { io, files } = makeFakeIO();
    await runVaultSync(deps(io));
    const from = keyOf(FOLDER, "notes/Deploy.md");
    const to = keyOf(FOLDER, "notes/Deployment.md");
    files.set(to, files.get(from)!);
    files.delete(from);
    const summary = await runVaultSync(deps(io));
    expect(summary.written).toBe(0);
    expect(files.has(from)).toBe(false);
    expect(files.has(to)).toBe(true);
    expect((await syncRepo.listByProject("p1")).find((r) => r.entityId === "n2")?.path).toBe("notes/Deployment.md");
  });

  it("lists a foreign markdown file and imports it only on request", async () => {
    const { io, files } = makeFakeIO();
    files.set(keyOf(FOLDER, "notes/Ideas from Obsidian.md"), "---\ntitle: Ideas from Obsidian\ntags: [idea]\n---\n\nFresh thought\n");
    const listed = await runVaultSync(deps(io));
    expect(listed.untracked).toBe(1);
    expect((await notesRepo.listByProject("p1")).some((n) => n.title === "Ideas from Obsidian")).toBe(false);
    const summary = await runVaultSync(deps(io, { adoptUntracked: true }));
    expect(summary.external).toBe(1);
    const created = (await notesRepo.listByProject("p1")).find((n) => n.title === "Ideas from Obsidian");
    expect(created?.body).toBe("Fresh thought");
    expect(created?.tags).toEqual(["idea"]);
  });

  it("refuses to touch a file it cannot read (truncated) and flags a conflict", async () => {
    const { io, files } = makeFakeIO();
    await runVaultSync(deps(io));
    const path = keyOf(FOLDER, "notes/Deploy.md");
    files.set(path, "x".repeat(600 * 1024));
    const summary = await runVaultSync(deps(io));
    expect(summary.blocked).toBe(1);
    expect(summary.written).toBe(0);
    expect(files.get(path)!.length).toBe(600 * 1024);
  });

  it("writes into the chosen root only (real disk)", async () => {
    const dir = scratchDir("engine");
    try {
      const nodeIo: VaultDeps["io"] = {
        list: async (_root, folder) => {
          const base = path.join(dir, folder);
          const out: { path: string; size: number; mtime: number }[] = [];
          const walk = (rel: string): void => {
            const abs = path.join(base, rel);
            if (!fs.existsSync(abs)) return;
            for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
              const childRel = rel ? `${rel}/${e.name}` : e.name;
              if (e.isDirectory()) walk(childRel);
              else out.push({ path: childRel, size: fs.statSync(path.join(base, childRel)).size, mtime: 0 });
            }
          };
          walk("");
          return { ok: true, files: out.filter((f) => f.path.endsWith(".md")) };
        },
        read: async (_root, p) => {
          const abs = path.join(dir, p);
          return fs.existsSync(abs)
            ? { ok: true, found: true, content: fs.readFileSync(abs, "utf8"), truncated: false }
            : { ok: false, found: false, content: "", truncated: false, error: "ENOENT" };
        },
        write: async (_root, p, content) => {
          const abs = path.join(dir, p);
          if (!abs.startsWith(dir)) return { ok: false, error: "outside root" };
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, content, "utf8");
          return { ok: true };
        },
        move: async (_root, from, to) => {
          const src = path.join(dir, from);
          const dest = path.join(dir, to);
          if (!dest.startsWith(dir) || !fs.existsSync(src)) return { ok: false, error: "ENOENT" };
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.renameSync(src, dest);
          return { ok: true };
        },
      };
      const summary = await runVaultSync(deps(nodeIo));
      expect(tmpList(dir)).toEqual([
        "MasarFlow/p1/notes/Auth design.md",
        "MasarFlow/p1/notes/Deploy.md",
      ]);
      expect(tmpRead(dir, "MasarFlow/p1/notes/Deploy.md")).toContain("docker compose");
      expect(summary.errors).toEqual([]);
    } finally {
      removeDir(dir);
    }
  });

  it("moves the file of a note deleted in the app to the replica trash, and keeps edited files", async () => {
    const { io, files } = makeFakeIO();
    await runVaultSync(deps(io));
    await removeEntity("note", "n2");
    // n1 is edited on disk, then deleted in the app: that file must be kept and flagged.
    files.set(keyOf(FOLDER, "notes/Auth design.md"), files.get(keyOf(FOLDER, "notes/Auth design.md"))! + "\nmy edit\n");
    await removeEntity("note", "n1");
    const summary = await runVaultSync(deps(io));
    expect(summary.trashed).toBe(1);
    expect(summary.conflicts).toBe(1);
    expect(files.has(keyOf(FOLDER, "notes/Deploy.md"))).toBe(false);
    expect(files.has(keyOf(FOLDER, ".masarflow-trash/notes/Deploy.md"))).toBe(true);
    expect(files.has(keyOf(FOLDER, "notes/Auth design.md"))).toBe(true);
    const rows = await syncRepo.listByProject("p1", "folder");
    expect(rows.map((r) => [r.entityId, r.status])).toEqual([["n1", "conflict"]]);
    // The user keeps the file: the note comes back from the trash with the edit.
    expect(await resolveVaultConflict(deps(io), "n1", "file")).toBe(true);
    expect((await db.notes.get("n1"))?.body).toContain("my edit");
    expect(await db.trash.count()).toBe(1);
  });

  it("converges after an interrupted run without duplicate rows or new ids", async () => {
    const { io, files } = makeFakeIO();
    let writes = 0;
    const flaky: VaultDeps["io"] = {
      ...io,
      write: async (root, p, content) => {
        writes += 1;
        if (writes === 2) throw new Error("app closed");
        return io.write(root, p, content);
      },
    };
    await expect(runVaultSync(deps(flaky))).rejects.toThrow("app closed");
    const partial = await syncRepo.listByProject("p1", "folder");
    expect(partial).toHaveLength(1);
    await runVaultSync(deps(io));
    const first = await syncRepo.listByProject("p1", "folder");
    await runVaultSync(deps(io));
    const second = await syncRepo.listByProject("p1", "folder");
    expect(second).toHaveLength(2);
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(first.find((r) => r.entityId === partial[0].entityId)?.id).toBe(partial[0].id);
    expect([...files.keys()].filter((k) => k.endsWith(".md"))).toHaveLength(2);
  });

  it("keeps the folder and Obsidian indexes apart", async () => {
    const { io } = makeFakeIO();
    await syncRepo.reconcile(
      "p1",
      [{ path: "notes/x.md", hash: "h", status: "synced", entityType: "note", entityId: "n1", lastSyncedAt: 1 }],
      "obsidian",
    );
    await runVaultSync(deps(io));
    expect(await syncRepo.listByProject("p1", "obsidian")).toHaveLength(1);
    expect(await syncRepo.listByProject("p1", "folder")).toHaveLength(2);
  });
});
