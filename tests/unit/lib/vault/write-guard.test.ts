import { describe, expect, it, vi } from "vitest";
import type { Doc } from "@/lib/db/schema";
import { assertRelativeVaultPath, claimOf, pathFor, uniquePaths } from "@/lib/vault/paths";
import { createVaultIO } from "@/lib/vault/io";
import { noteRow, specRow, taskRow } from "./_fixtures";

const doc: Doc = {
  id: "d1", projectId: "p1", title: "Setup", slug: "setup", category: "guides", body: "x",
  sourceType: "manual", createdAt: 0, updatedAt: 0,
};

describe("the vault never writes outside its root", () => {
  it("every path the mirror can produce is relative and inside a mirror directory", () => {
    const note = noteRow();
    const spec = specRow();
    const task = taskRow();
    const paths = [
      pathFor("note", note), pathFor("note", note, "Auth/Flows"), pathFor("doc", doc),
      pathFor("spec", spec), pathFor("task", task),
      pathFor("note", { ...note, props: { day: "2026-10-16" } }),
    ];
    for (const p of paths) {
      expect(p.startsWith("/")).toBe(false);
      expect(p).not.toMatch(/\.\./);
      expect(assertRelativeVaultPath(p)).toBe(p);
      expect(["notes", "docs", "specs", "tasks", "daily"]).toContain(p.split("/")[0]);
      expect(claimOf(p)).not.toBeNull();
    }
  });

  it("uniquePaths never hands out the same path twice, even case-insensitively", () => {
    const out = uniquePaths([
      { path: "notes/a.md" }, { path: "notes/A.md" }, { path: "notes/a-2.md" }, { path: "notes/a.md" },
    ]);
    const seen = new Set(out.map((o) => o.path.toLowerCase()));
    expect(seen.size).toBe(out.length);
  });

  it("the io layer refuses an escaping path before any request is made", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const io = createVaultIO();
    await expect(io.write("C:/root", "notes/../../escape.md", "x")).rejects.toThrow(/illegal "\.\." segment/);
    await expect(io.write("C:/root", "/etc/passwd", "x")).rejects.toThrow(/relative/);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
