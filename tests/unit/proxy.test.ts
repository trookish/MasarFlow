import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const url = "http://127.0.0.1:41000/api/fs/list";
// Hermetic: the shell running the tests may itself carry a launch token.
beforeEach(() => {
  vi.stubEnv("MASARFLOW_TOKEN", "");
  vi.stubEnv("PORT", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy", () => {
  it("passes a same-origin API call in browser dev (no launch token)", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/api/fs/list", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "http://localhost:3000" },
      }),
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
  it("rejects a cross-origin POST in browser dev (no launch token)", async () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/api/fs/shell", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "https://evil.test" },
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/origin not allowed/);
  });
  it("returns 401 JSON when the token is missing", async () => {
    process.env.MASARFLOW_TOKEN = "tok";
    process.env.PORT = "41000";
    const res = proxy(new NextRequest(url, { headers: { host: "127.0.0.1:41000" } }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/^MasarFlow guard:/);
  });
  it("passes a fully valid request", () => {
    process.env.MASARFLOW_TOKEN = "tok";
    process.env.PORT = "41000";
    const res = proxy(
      new NextRequest(url, {
        method: "POST",
        headers: { host: "127.0.0.1:41000", origin: "masarflow://app", "x-masarflow-token": "tok" },
      }),
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
