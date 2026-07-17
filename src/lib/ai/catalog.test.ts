import { describe, it, expect } from "vitest";
import {
  FALLBACK_CATALOG,
  flattenProviders,
  modelsForProvider,
  searchModels,
  providerFormat,
  providerBaseUrl,
  isChatModel,
  defaultModelId,
  type AiProvider,
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

describe("providerBaseUrl — Google quirk", () => {
  it("routes Google to its OpenAI-compatible surface", () => {
    expect(
      providerBaseUrl({ id: "google", name: "Google", models: {} }),
    ).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
  });
});

describe("isChatModel", () => {
  it("rejects embedding / tts / image / video models by id or name", () => {
    expect(isChatModel({ id: "text-embedding-3-large", name: "Embedding" })).toBe(false);
    expect(isChatModel({ id: "gemini-2.5-flash-preview-tts", name: "Flash TTS" })).toBe(false);
    expect(isChatModel({ id: "imagen-3", name: "Imagen 3" })).toBe(false);
    expect(isChatModel({ id: "veo-2", name: "Veo Video" })).toBe(false);
    expect(isChatModel({ id: "whisper-1", name: "Whisper" })).toBe(false);
  });
  it("rejects models whose only output modality is non-text", () => {
    expect(
      isChatModel({ id: "img-gen", name: "Gen", modalities: { output: ["image"] } }),
    ).toBe(false);
  });
  it("accepts normal chat models", () => {
    expect(isChatModel({ id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" })).toBe(true);
    expect(isChatModel({ id: "gpt-4o", name: "GPT-4o" })).toBe(true);
  });
});

describe("noAuth providers", () => {
  it("marks the local Ollama entry as not requiring an API key", () => {
    expect(FALLBACK_CATALOG.ollama.noAuth).toBe(true);
    expect(FALLBACK_CATALOG.ollama.api).toBe("http://localhost:11434/v1");
  });
  it("defaults other providers to requiring a key", () => {
    expect(FALLBACK_CATALOG.openai.noAuth).toBeUndefined();
  });
});

describe("defaultModelId", () => {
  it("prefers a chat-capable model that supports tools", () => {
    const provider: AiProvider = {
      id: "x",
      name: "X",
      models: {
        "text-embedding-3": { id: "text-embedding-3", name: "AAA Embedding" },
        "chat-notools": { id: "chat-notools", name: "BBB Chat" },
        "chat-tools": { id: "chat-tools", name: "CCC Chat", tool_call: true },
      },
    };
    // Alphabetically the embedding model sorts first, but it must be skipped.
    expect(defaultModelId(provider)).toBe("chat-tools");
  });
  it("falls back to a chat model when none support tools", () => {
    const provider: AiProvider = {
      id: "x",
      name: "X",
      models: {
        "embed": { id: "embed", name: "AAA embed" },
        "chat": { id: "chat", name: "ZZZ chat" },
      },
    };
    expect(defaultModelId(provider)).toBe("chat");
  });
});
