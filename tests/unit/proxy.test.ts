import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const url = "http://127.0.0.1:41000/api/fs/list";
afterEach(() => {
  delete process.env.MASARFLOW_TOKEN;
  delete process.env.PORT;
});

describe("proxy", () => {
  it("passes everything through when no launch token is configured (browser dev)", () => {
    const res = proxy(new NextRequest(url, { method: "POST" }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
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
