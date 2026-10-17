import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/models/discover/route";

function req(b: Record<string, unknown>) {
  return new Request("http://localhost/api/models/discover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b),
  });
}

describe("api/models/discover route", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [{ id: "qwen3-coder" }, { id: "llama-3.3" }, { id: "deepseek-r1" }],
        }),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("proxies GET {baseUrl}/models and returns sorted ids", async () => {
    const res = await POST(req({ baseUrl: "http://127.0.0.1:1234/v1", apiKey: "sk-test" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      models: ["deepseek-r1", "llama-3.3", "qwen3-coder"],
    });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:1234/v1/models");
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer sk-test",
    });
  });

  it("strips trailing slashes from the base URL", async () => {
    await POST(req({ baseUrl: "https://api.example.com/v1///" }));
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe("https://api.example.com/v1/models");
  });

  it("rejects non-http(s) base URLs with 400 and never fetches", async () => {
    const res = await POST(req({ baseUrl: "file:///etc/passwd" }));
    expect(res.status).toBe(400);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("rejects a missing base URL with 400", async () => {
    expect((await POST(req({ apiKey: "sk-test" }))).status).toBe(400);
    expect((await POST(req({ baseUrl: "   " }))).status).toBe(400);
  });

  it("reports an upstream failure as 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );
    const res = await POST(req({ baseUrl: "http://127.0.0.1:1234/v1" }));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("503");
  });

  it("reports an unreachable endpoint as 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    );
    expect((await POST(req({ baseUrl: "http://127.0.0.1:9/v1" }))).status).toBe(
      502,
    );
  });
});
