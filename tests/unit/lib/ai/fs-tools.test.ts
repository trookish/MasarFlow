import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FS_TOOLS,
  FS_TOOL_NAMES,
  SENSITIVE_FS_TOOLS,
  executeFsTool,
} from "@/lib/ai/fs-tools";
import type { LinkedProject } from "@/lib/db/schema";

const ROOT: LinkedProject = {
  id: "lp1",
  projectId: "p1",
  name: "game",
  rootPath: "C:\\Dev\\game",
  createdAt: 0,
};

describe("FS_TOOLS definitions", () => {
  it("has unique names and object schemas", () => {
    const names = FS_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of FS_TOOLS) {
      expect(t.parameters.type).toBe("object");
      expect(t.description.length).toBeGreaterThan(10);
    }
    expect(FS_TOOL_NAMES.size).toBe(FS_TOOLS.length);
  });

  it("marks exactly fs_write and shell_run as sensitive", () => {
    expect([...SENSITIVE_FS_TOOLS].sort()).toEqual(["fs_write", "shell_run"]);
    for (const s of SENSITIVE_FS_TOOLS) expect(FS_TOOL_NAMES.has(s)).toBe(true);
  });
});

describe("executeFsTool", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("fails cleanly when no external project is linked", async () => {
    const result = JSON.parse(
      await executeFsTool(
        { roots: [], requestApproval: async () => true },
        { id: "1", name: "fs_list", arguments: {} },
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No external project is linked/);
  });

  it("fails cleanly for an unknown linked-root reference", async () => {
    const result = JSON.parse(
      await executeFsTool(
        { roots: [ROOT], requestApproval: async () => true },
        { id: "1", name: "fs_list", arguments: { root: "nope" } },
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No linked project matches/);
  });

  it("never calls the API when a sensitive action is denied", async () => {
    const result = JSON.parse(
      await executeFsTool(
        { roots: [ROOT], requestApproval: async () => false },
        {
          id: "1",
          name: "shell_run",
          arguments: { command: "rm -rf ." },
        },
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/denied/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("runs read-only tools without asking for approval", async () => {
    const requestApproval = vi.fn(async () => true);
    const result = JSON.parse(
      await executeFsTool(
        { roots: [ROOT], requestApproval },
        { id: "1", name: "fs_search", arguments: { query: "player" } },
      ),
    );
    expect(result.ok).toBe(true);
    expect(requestApproval).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/fs/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("asks approval then executes sensitive tools when allowed", async () => {
    const result = JSON.parse(
      await executeFsTool(
        { roots: [ROOT], requestApproval: async () => true },
        {
          id: "1",
          name: "fs_write",
          arguments: { path: "Assets/A.cs", content: "class A {}" },
        },
      ),
    );
    expect(result.ok).toBe(true);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = JSON.parse(String(init?.body));
    expect(payload.root).toBe(ROOT.rootPath);
    expect(payload.path).toBe("Assets/A.cs");
  });
});
