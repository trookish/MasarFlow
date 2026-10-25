import { describe, expect, it } from "vitest";
import type { SyncFile } from "@/lib/db/schema";
import { countByStatus, vaultConflicts, vaultSummaryLine, visibleRows } from "@/lib/vault/view";

const row = (over: Partial<SyncFile> = {}): SyncFile => ({
  id: "r1", projectId: "p1", adapter: "folder", path: "notes/a.md", hash: "H", mtime: 0,
  status: "synced", entityType: "note", entityId: "n1", lastSyncedAt: 1, ...over,
});

describe("vault view model", () => {
  it("counts statuses including deleted", () => {
    const counts = countByStatus([
      row(), row({ id: "r2", status: "conflict" }), row({ id: "r3", status: "deleted" }),
      row({ id: "r4", status: "local_modified" }),
    ]);
    expect(counts).toMatchObject({ synced: 1, conflict: 1, deleted: 1, local_modified: 1 });
  });

  it("lists only what the user must act on, newest risk first", () => {
    const rows = [
      row({ id: "r1", status: "synced" }),
      row({ id: "r2", path: "notes/b.md", status: "conflict" }),
      row({ id: "r3", path: "notes/c.md", status: "deleted" }),
      row({ id: "r4", path: "notes/d.md", status: "local_modified" }),
    ];
    expect(vaultConflicts(rows).map((r) => r.path)).toEqual(["notes/b.md", "notes/c.md"]);
    expect(visibleRows(rows, "conflict").map((r) => r.path)).toEqual(["notes/b.md"]);
    expect(visibleRows(rows, "all").map((r) => r.path)).toEqual(["notes/b.md", "notes/c.md", "notes/d.md", "notes/a.md"]);
  });

  it("summarizes a run in one line", () => {
    expect(vaultSummaryLine({ written: 2, imported: 1, conflicts: 0, missing: 0, external: 0, blocked: 0, skipped: 3, pending: 0, untracked: 0, trashed: 0, errors: [] })).toBe(
      "2 written · 1 imported · 3 unchanged",
    );
    expect(vaultSummaryLine({ written: 0, imported: 0, conflicts: 1, missing: 1, external: 0, blocked: 0, skipped: 0, pending: 0, untracked: 0, trashed: 0, errors: ["x"] })).toBe(
      "1 conflict · 1 deleted on disk · 1 warning",
    );
    expect(vaultSummaryLine({ written: 0, imported: 0, conflicts: 0, missing: 0, external: 0, blocked: 0, skipped: 0, pending: 0, untracked: 0, trashed: 0, errors: [] })).toBe(
      "Everything is in sync",
    );
  });
});
