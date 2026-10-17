import { describe, it, expect } from "vitest";
import { CUSTOM_PROVIDER_ID, customProvider, resolveConnectionProvider } from "@/lib/ai/providers/custom";
import { FALLBACK_CATALOG } from "@/lib/ai/catalog";

describe("custom provider", () => {
  it("builds an OpenAI-format provider from a connection's base URL", () => {
    const p = customProvider({ id: "c9", label: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1" }, ["qwen3-coder"]);
    expect(p.id).toBe(CUSTOM_PROVIDER_ID);
    expect(p.api).toBe("http://127.0.0.1:1234/v1");
    expect(Object.keys(p.models)).toEqual(["qwen3-coder"]);
  });
  it("resolves catalog providers by id and custom ones from the connection", () => {
    const known = resolveConnectionProvider(FALLBACK_CATALOG, { id: "c1", label: "A", providerId: "anthropic", baseUrl: "" });
    expect(known?.id).toBe("anthropic");
    const custom = resolveConnectionProvider(FALLBACK_CATALOG, { id: "c2", label: "X", providerId: CUSTOM_PROVIDER_ID, baseUrl: "http://h/v1" });
    expect(custom?.api).toBe("http://h/v1");
    expect(resolveConnectionProvider(FALLBACK_CATALOG, { id: "c3", label: "Y", providerId: CUSTOM_PROVIDER_ID, baseUrl: "" })).toBeNull();
  });
});
