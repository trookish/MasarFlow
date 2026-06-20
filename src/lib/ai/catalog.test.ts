import { describe, it, expect } from "vitest";
import {
  FALLBACK_CATALOG,
  flattenProviders,
  modelsForProvider,
  searchModels,
  providerFormat,
  providerBaseUrl,
} from "./catalog";

describe("providerFormat", () => {
  it("uses the Anthropic format for Anthropic", () => {
    expect(providerFormat({ id: "anthropic", npm: "@ai-sdk/anthropic" })).toBe(
      "anthropic",
    );
  });
  it("defaults everything else to OpenAI-compatible", () => {
    expect(providerFormat({ id: "openai", npm: "@ai-sdk/openai" })).toBe("openai");
    expect(providerFormat({ id: "openrouter", npm: "x" })).toBe("openai");
    expect(providerFormat({ id: "groq" })).toBe("openai");
  });
});

describe("providerBaseUrl", () => {
  it("prefers the catalog api url", () => {
    expect(providerBaseUrl(FALLBACK_CATALOG.openrouter)).toBe(
      "https://openrouter.ai/api/v1",
    );
  });
  it("falls back by provider id when api is missing", () => {
    expect(
      providerBaseUrl({ id: "anthropic", name: "A", models: {} }),
    ).toBe("https://api.anthropic.com");
    expect(providerBaseUrl({ id: "whatever", name: "W", models: {} })).toBe(
      "https://api.openai.com/v1",
    );
  });
});

describe("catalog helpers", () => {
  it("flattens providers sorted by name", () => {
    const names = flattenProviders(FALLBACK_CATALOG).map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toContain("Anthropic");
    expect(names).toContain("OpenAI");
  });

  it("lists a provider's models sorted by name", () => {
    const models = modelsForProvider(FALLBACK_CATALOG.openai);
    expect(models.length).toBe(2);
    expect(models.map((m) => m.name)).toEqual(["GPT-4o", "GPT-4o mini"]);
  });

  it("searches models by name or id", () => {
    expect(searchModels(FALLBACK_CATALOG.anthropic, "haiku")).toHaveLength(1);
    expect(searchModels(FALLBACK_CATALOG.anthropic, "")).toHaveLength(2);
    expect(searchModels(FALLBACK_CATALOG.anthropic, "zzz")).toHaveLength(0);
  });
});
