import { describe, it, expect, vi, beforeEach } from "vitest";
import { testConnection } from "@/lib/ai/providers/test-connection";
import { streamChat } from "@/lib/ai/chat-client";
import type { AiProvider } from "@/lib/ai/catalog";

vi.mock("@/lib/ai/chat-client", () => ({ streamChat: vi.fn() }));

const provider: AiProvider = {
  id: "anthropic",
  name: "Anthropic",
  api: "https://api.anthropic.com",
  models: {},
};

describe("testConnection", () => {
  beforeEach(() => {
    vi.mocked(streamChat).mockReset();
  });

  it("resolves ok when the provider streams text", async () => {
    vi.mocked(streamChat).mockImplementation(async (opts) => {
      opts.onDelta("ok");
    });
    expect(
      await testConnection({ provider, apiKey: "sk-test", model: "m" }),
    ).toEqual({ ok: true });
  });

  it("fails with a provider-error message when the provider answered nothing", async () => {
    vi.mocked(streamChat).mockImplementation(async () => {});
    const r = await testConnection({ provider, apiKey: "sk-test", model: "m" });
    expect(r).toEqual({
      ok: false,
      error: "The provider answered but returned no text.",
    });
  });

  it("maps auth failures to the friendly message", async () => {
    vi.mocked(streamChat).mockRejectedValue(new Error("401 invalid api key"));
    const r = await testConnection({ provider, apiKey: "sk-test", model: "m" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.startsWith("Authentication failed")).toBe(true);
  });
});
