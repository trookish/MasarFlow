import { describe, it, expect, vi, afterEach } from "vitest";
import { POST as issuesPost } from "@/app/api/github/issues/route";
import { POST as pullsPost } from "@/app/api/github/pulls/route";

afterEach(() => vi.unstubAllGlobals());

const post = (body: unknown): Request =>
  new Request("http://127.0.0.1:3000/api/github/issues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function stub(payloads: unknown[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return new Response(JSON.stringify(payloads.shift() ?? {}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

describe("POST /api/github/issues", () => {
  it("rejects a body without a token", async () => {
    const res = await issuesPost(post({ owner: "o", repo: "r", action: "list" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/token/i);
  });
  it("rejects an unknown action", async () => {
    const res = await issuesPost(post({ pat: "t", owner: "o", repo: "r", action: "nope" }));
    expect(res.status).toBe(400);
  });
  it("lists issues", async () => {
    const calls = stub([{ total_count: 0, items: [] }]);
    const res = await issuesPost(post({ pat: "t", owner: "o", repo: "r", action: "list" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ issues: [], pullCount: 0 });
    expect(calls[0]).toContain("/repos/o/r/issues");
  });
  it("creates an issue", async () => {
    const calls = stub([{ number: 5, title: "T", state: "open", html_url: "u", updated_at: "d" }]);
    const res = await issuesPost(post({ pat: "t", owner: "o", repo: "r", action: "create", title: "T", body: "B" }));
    expect((await res.json()).issue.number).toBe(5);
    expect(calls[0]).toMatch(/^POST /);
  });
  it("closes an issue", async () => {
    const calls = stub([{ number: 5, state: "closed" }]);
    const res = await issuesPost(post({ pat: "t", owner: "o", repo: "r", action: "close", number: 5 }));
    expect((await res.json()).issue.state).toBe("closed");
    expect(calls[0]).toMatch(/^PATCH .*\/issues\/5$/);
  });
  it("maps a 401 to a friendly message with the same status", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401, headers: { "content-type": "application/json" },
      }));
    const res = await issuesPost(post({ pat: "bad", owner: "o", repo: "r", action: "list" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("401");
  });
});

describe("POST /api/github/pulls", () => {
  it("lists pulls with their CI summary", async () => {
    stub([
      [{ number: 43, title: "P", state: "open", head: { sha: "a".repeat(40) }, html_url: "u", updated_at: "d" }],
      { total_count: 0, check_runs: [] },
    ]);
    const res = await pullsPost(post({ pat: "t", owner: "o", repo: "r", action: "list", state: "open" }));
    const json = await res.json();
    expect(json.pulls).toHaveLength(1);
    expect(json.pulls[0].ci).toBe("none");
  });
  it("requires a token", async () => {
    const res = await pullsPost(post({ owner: "o", repo: "r", action: "list" }));
    expect(res.status).toBe(400);
  });
});
