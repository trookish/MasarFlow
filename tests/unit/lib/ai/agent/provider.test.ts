import { describe, it, expect, vi, afterEach } from "vitest";
import { ProxyProvider } from "@/lib/ai/agent/provider";
import { createAgentLogger } from "@/lib/ai/agent/logger";

/**
 * Regression: the provider abstraction must forward the provider's `api`
 * base URL to the wire client. When it only carried id/name/noAuth, every
 * request fell back to https://api.openai.com/v1 — a legit OpenRouter key
 * then got sent to OpenAI and 401'd (the exact failure from user reports).
 */

function ndjson(events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

function stubProxy(assertBody: (body: Record<string, unknown>) => void) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      assertBody(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        ndjson([
          { type: "text", text: "hi from the mock" },
          { type: "done", stopReason: "end" },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/x-ndjson" },
        },
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProxyProvider — base URL resolution", () => {
  it("sends the provider's own api base URL (OpenRouter must not hit OpenAI)", async () => {
    const seen: { body: Record<string, unknown> | null } = { body: null };
    stubProxy((body) => (seen.body = body));

    const provider = new ProxyProvider(createAgentLogger("req_provider_test"));
    const result = await provider.generate(
      {
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          api: "https://openrouter.ai/api/v1",
        },
        apiKey: "sk-or-v1-test",
        model: "openrouter/free",
        messages: [{ role: "user", content: "hi" }],
        requestId: "req_provider_test",
      },
      () => {},
    );

    expect(seen.body?.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(seen.body?.requestId).toBe("req_provider_test");
    expect(result.text).toBe("hi from the mock");
  });

  it("falls back to OpenAI's endpoint only when the provider has no api", async () => {
    const seen: { body: Record<string, unknown> | null } = { body: null };
    stubProxy((body) => (seen.body = body));

    const provider = new ProxyProvider(createAgentLogger("req_unknown"));
    await provider.generate(
      {
        provider: { id: "mystery-provider", name: "Mystery" },
        apiKey: "k",
        model: "m",
        messages: [{ role: "user", content: "hi" }],
      },
      () => {},
    );

    expect(seen.body?.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("honours an explicit connection base URL override", async () => {
    const seen: { body: Record<string, unknown> | null } = { body: null };
    stubProxy((body) => (seen.body = body));

    const provider = new ProxyProvider(createAgentLogger("req_custom"));
    await provider.generate(
      {
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          api: "https://openrouter.ai/api/v1",
        },
        apiKey: "k",
        baseUrl: "https://my-gateway.example.com/v1",
        model: "m",
        messages: [{ role: "user", content: "hi" }],
      },
      () => {},
    );

    expect(seen.body?.baseUrl).toBe("https://my-gateway.example.com/v1");
  });
});
