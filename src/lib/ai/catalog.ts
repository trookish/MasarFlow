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
  /** Provider doesn't require an API key (e.g. a local server like Ollama). */
  noAuth?: boolean;
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
  // Google's OpenAI-compatible surface lives under /openai — the raw
  // generativelanguage base from models.dev would 404 on /chat/completions.
  if (provider.id === "google") {
    return "https://generativelanguage.googleapis.com/v1beta/openai";
  }
  if (provider.api) return provider.api;
  if (provider.id === "anthropic") return "https://api.anthropic.com";
  return "https://api.openai.com/v1";
}

/* ── Model capabilities ───────────────────────────────────────────────── */

/** Catalog metadata for a model id, if the catalog knows it. */
export function modelMeta(
  provider: AiProvider,
  modelId: string,
): AiModel | undefined {
  return provider.models[modelId];
}

/**
 * Whether a model can do function/tool calling. Unknown models default to
 * true — the /api/chat proxy degrades gracefully (retries without tools) if
 * the provider rejects them, so optimism costs one retried request at worst.
 */
export function modelSupportsTools(
  provider: AiProvider,
  modelId: string,
): boolean {
  const m = modelMeta(provider, modelId);
  return m ? m.tool_call === true : true;
}

/** Whether a model accepts image input. Unknown models default to false. */
export function modelSupportsImages(
  provider: AiProvider,
  modelId: string,
): boolean {
  return modelMeta(provider, modelId)?.attachment === true;
}

/** Whether a model exposes reasoning/extended thinking. Unknown → false. */
export function modelSupportsReasoning(
  provider: AiProvider,
  modelId: string,
): boolean {
  return modelMeta(provider, modelId)?.reasoning === true;
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

// Names that indicate a model can't do chat completions (embeddings, image
// generation, speech, moderation, video). Used to keep them from becoming a
// thread's default and silently "not responding".
const NON_CHAT_RE =
  /embed|embedding|imagen|image-gen|dall-?e|tts|whisper|speech|audio|transcri|moderation|rerank|guard|veo|video|vision-only/i;

/** Whether a model can plausibly handle a chat/completions request. */
export function isChatModel(model: AiModel): boolean {
  if (NON_CHAT_RE.test(model.id) || NON_CHAT_RE.test(model.name)) return false;
  // Text output is required for chat; models.dev marks output modalities.
  const outputs = model.modalities?.output;
  if (outputs && outputs.length > 0 && !outputs.includes("text")) return false;
  return true;
}

/**
 * The best default model for a new thread on a provider: the first chat-capable
 * model, preferring one that supports tools. Falls back to the first model when
 * the catalog has no clearly chat-capable entry.
 */
export function defaultModelId(provider: AiProvider): string {
  const models = modelsForProvider(provider);
  const chat = models.filter(isChatModel);
  const pool = chat.length ? chat : models;
  const withTools = pool.find((m) => m.tool_call);
  return (withTools ?? pool[0])?.id ?? "";
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
  ollama: {
    id: "ollama",
    name: "Local (Ollama)",
    api: "http://localhost:11434/v1",
    doc: "https://github.com/ollama/ollama/blob/main/docs/api.md",
    noAuth: true,
    // Populated dynamically from the local Ollama server — see /api/ollama/models.
    models: {},
  },
};

const CATALOG_URL = "https://models.dev/api.json";

let cache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;

/**
 * The "Local (Ollama)" catalog entry ships with no models — Ollama's
 * installed models vary per machine. Ask the local server (via the
 * loopback-only /api/ollama/models proxy) what's actually installed.
 * Never throws: an unreachable Ollama server just leaves the entry empty.
 */
async function withLocalOllamaModels(catalog: Catalog): Promise<Catalog> {
  if (typeof window === "undefined" || !catalog.ollama) return catalog;
  try {
    const res = await fetch("/api/ollama/models", { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return catalog;
    const data = (await res.json()) as {
      ok: boolean;
      models?: { id: string; name: string }[];
    };
    if (!data.ok || !data.models?.length) return catalog;
    const models: Record<string, AiModel> = {};
    for (const m of data.models) {
      // Ollama's tool-calling support varies by model; offer tools and let
      // /api/chat's degradation ladder drop them if the model rejects.
      models[m.id] = { id: m.id, name: m.name, tool_call: true };
    }
    return { ...catalog, ollama: { ...catalog.ollama, models } };
  } catch {
    return catalog;
  }
}

/**
 * Fetch the full models.dev catalog, cached for the session. Returns the
 * baked-in fallback if the network is unavailable so the UI always works.
 */
export async function fetchCatalog(): Promise<Catalog> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    let base: Catalog;
    try {
      const res = await fetch(CATALOG_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error(`models.dev ${res.status}`);
      const data = (await res.json()) as Catalog;
      // Merge so the well-known providers always have a sane base URL/format.
      base = { ...FALLBACK_CATALOG, ...data };
    } catch {
      base = FALLBACK_CATALOG;
    }
    cache = await withLocalOllamaModels(base);
    inflight = null;
    return cache;
  })();
  return inflight;
}
