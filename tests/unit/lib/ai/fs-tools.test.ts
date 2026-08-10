import { describe, it, expect, vi, afterEach } from "vitest";
import { executeFsTool } from "@/lib/ai/fs-tools";
import type { LinkedProject } from "@/lib/db/schema";

/**
 * Cancellation safety of the fs/shell tool layer. The regression this suite
 * exists for: an approval that nobody settles (Stop pressed, thread switched,
 * tab closed) used to leave the agent loop suspended forever on a promise —
 * the "stuck after a tool call" failure. The tool must now abort promptly
 * when the run's signal fires.
 */

const ROOTS: LinkedProject[] = [
  {
    id: "r1",
    projectId: "p1",
    name: "MyGame",
    rootPath: "C:\\dev\\MyGame",
    createdAt: 0,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("executeFsTool — cancellation", () => {
  it("does not hang when the signal aborts while approval is pending", async () => {
    const controller = new AbortController();
    let approvalCalled = false;
    const resultPromise = executeFsTool(
      {
        roots: ROOTS,
        signal: controller.signal,
        // The approval promise never settles — the UI is gone (Stop/close).
        requestApproval: () => {
          approvalCalled = true;
          return new Promise<boolean>(() => {});
        },
      },
      {
        id: "t1",
        name: "fs_write",
        arguments: { path: "a.txt", content: "x" },
      },
    );

    setTimeout(() => controller.abort(), 10);
    const result = await Promise.race([
      resultPromise,
      new Promise<string>((r) => setTimeout(() => r("TIMEOUT"), 1000)),
    ]);

    expect(result).not.toBe("TIMEOUT");
    expect(approvalCalled).toBe(true);
    const parsed = JSON.parse(result as string) as {
      ok: boolean;
      error: string;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("cancelled");
  });

  it("skips approval entirely when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let approvalCalled = false;
    const result = await executeFsTool(
      {
        roots: ROOTS,
        signal: controller.signal,
        requestApproval: () => {
          approvalCalled = true;
          return Promise.resolve(true);
        },
      },
      { id: "t1", name: "shell_run", arguments: { command: "npm test" } },
    );
    expect(approvalCalled).toBe(false);
    expect(JSON.parse(result)).toMatchObject({
      ok: false,
      error: expect.stringContaining("cancelled"),
    });
  });

  it("reports a user denial without touching the machine", async () => {
    const result = await executeFsTool(
      {
        roots: ROOTS,
        requestApproval: () => Promise.resolve(false),
      },
      { id: "t1", name: "shell_run", arguments: { command: "rm -rf /" } },
    );
    expect(JSON.parse(result)).toMatchObject({
      ok: false,
      error: expect.stringContaining("denied"),
    });
  });

  it("forwards an aborted fs fetch as a cancelled result", async () => {
    // A slow server-side operation (e.g. a long fs_search) whose request is
    // still in flight when the run is cancelled: the fetch rejects with
    // AbortError and the tool reports cancellation instead of a raw error.
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }),
    );

    const resultPromise = executeFsTool(
      {
        roots: ROOTS,
        signal: controller.signal,
        requestApproval: () => Promise.resolve(true),
      },
      { id: "t1", name: "fs_search", arguments: { query: "PlayerController" } },
    );
    setTimeout(() => controller.abort(), 10);
    const result = await Promise.race([
      resultPromise,
      new Promise<string>((r) => setTimeout(() => r("TIMEOUT"), 1000)),
    ]);

    expect(result).not.toBe("TIMEOUT");
    expect(JSON.parse(result as string)).toMatchObject({
      ok: false,
      error: expect.stringContaining("cancelled"),
    });
  });

  it("resolves read-only tools normally (fs_list passes its request through)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(String(url)).toContain("/api/fs/list");
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.requestId).toBe("req_abc");
        return new Response(
          JSON.stringify({
            ok: true,
            entries: [{ path: "a.txt", type: "file" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const result = await executeFsTool(
      {
        roots: ROOTS,
        requestId: "req_abc",
        requestApproval: () => Promise.resolve(true),
      },
      { id: "t1", name: "fs_list", arguments: { depth: 1 } },
    );
    const parsed = JSON.parse(result) as { ok: boolean; entries: unknown[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.entries.length).toBe(1);
  });
});
