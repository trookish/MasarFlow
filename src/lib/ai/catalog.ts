// The provider/model catalog is sourced from models.dev — an open database of
// every AI provider and model (https://models.dev/api.json). We fetch it at
// runtime and cache it, falling back to a small baked-in subset when offline.

export interface AiModel {
  id: string;
  name: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number };
}

export interface AiProvider {
  id: string;
  name: string;
  api?: string;
  doc?: string;
  npm?: string;
  env?: string[];
  models: Record<string, AiModel>;
}

export type Catalog = Record<string, AiProvider>;

/** How to talk to a provider's API. */
export type ProviderFormat = "openai" | "anthropic";

/**
 * Most providers expose an OpenAI-compatible `/chat/completions` endpoint
 * (OpenAI, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Fireworks, …).
 * Anthropic uses its own `/v1/messages` format. We key off the provider id /
 * npm package to choose.
 */
export function providerFormat(provider: Pick<AiProvider, "id" | "npm">): ProviderFormat {
  if (provider.id === "anthropic" || provider.npm === "@ai-sdk/anthropic") {
    return "anthropic";
  }
  return "openai";
}

/** Default base URL for a provider's API (models.dev `api`, with fallbacks). */
export function providerBaseUrl(provider: AiProvider): string {
  if (provider.api) return provider.api;
  if (provider.id === "anthropic") return "https://api.anthropic.com";
  return "https://api.openai.com/v1";
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Providers as a sorted array (by display name). */
export function flattenProviders(catalog: Catalog): AiProvider[] {
  return Object.values(catalog).sort((a, b) => a.name.localeCompare(b.name));
}

/** A provider's models as a sorted array (newest-looking names first-ish: by name). */
export function modelsForProvider(provider: AiProvider): AiModel[] {
  return Object.values(provider.models).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Filter a provider's models by a free-text query over id/name. */
export function searchModels(provider: AiProvider, query: string): AiModel[] {
  const q = query.trim().toLowerCase();
  const all = modelsForProvider(provider);
  if (!q) return all;
  return all.filter(
    (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
  );
}

// ── Fallback catalog (offline + first paint + tests) ──────────────────────────

export const FALLBACK_CATALOG: Catalog = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    api: "https://api.anthropic.com",
    doc: "https://docs.anthropic.com",
    npm: "@ai-sdk/anthropic",
    env: ["ANTHROPIC_API_KEY"],
    models: {
      "claude-sonnet-4-5": {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        family: "claude-sonnet",
        tool_call: true,
        reasoning: true,
        attachment: true,
        limit: { context: 200000, output: 64000 },
        cost: { input: 3, output: 15 },
      },
      "claude-3-5-haiku-latest": {
        id: "claude-3-5-haiku-latest",
        name: "Claude Haiku 3.5",
        family: "claude-haiku",
        tool_call: true,
        limit: { context: 200000, output: 8192 },
        cost: { input: 0.8, output: 4 },
      },
    },
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    api: "https://api.openai.com/v1",
    doc: "https://platform.openai.com/docs",
    npm: "@ai-sdk/openai",
    env: ["OPENAI_API_KEY"],
    models: {
      "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o",
        tool_call: true,
        attachment: true,
        limit: { context: 128000, output: 16384 },
        cost: { input: 2.5, output: 10 },
      },
      "gpt-4o-mini": {
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
        tool_call: true,
        limit: { context: 128000, output: 16384 },
        cost: { input: 0.15, output: 0.6 },
      },
    },
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    api: "https://openrouter.ai/api/v1",
    doc: "https://openrouter.ai/docs",
    npm: "@openrouter/ai-sdk-provider",
    env: ["OPENROUTER_API_KEY"],
    models: {
      "anthropic/claude-sonnet-4.5": {
        id: "anthropic/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5 (via OpenRouter)",
        tool_call: true,
        limit: { context: 200000 },
      },
      "openai/gpt-4o": {
        id: "openai/gpt-4o",
        name: "GPT-4o (via OpenRouter)",
        tool_call: true,
        limit: { context: 128000 },
      },
    },
  },
  groq: {
    id: "groq",
    name: "Groq",
    api: "https://api.groq.com/openai/v1",
    doc: "https://console.groq.com/docs",
    npm: "@ai-sdk/groq",
    env: ["GROQ_API_KEY"],
    models: {
      "llama-3.3-70b-versatile": {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B",
        tool_call: true,
        limit: { context: 131072 },
      },
    },
  },
};

const CATALOG_URL = "https://models.dev/api.json";

let cache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;

/**
 * Fetch the full models.dev catalog, cached for the session. Returns the
 * baked-in fallback if the network is unavailable so the UI always works.
 */
export async function fetchCatalog(): Promise<Catalog> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(CATALOG_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error(`models.dev ${res.status}`);
      const data = (await res.json()) as Catalog;
      // Merge so the well-known providers always have a sane base URL/format.
      cache = { ...FALLBACK_CATALOG, ...data };
      return cache;
    } catch {
      cache = FALLBACK_CATALOG;
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
