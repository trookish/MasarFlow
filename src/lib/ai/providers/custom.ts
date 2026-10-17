import type { AiProvider, Catalog } from "@/lib/ai/catalog";

export const CUSTOM_PROVIDER_ID = "custom";

export function customProvider(
  conn: { id: string; label: string; baseUrl: string },
  modelIds: string[] = [],
): AiProvider {
  const models: AiProvider["models"] = {};
  for (const id of modelIds) {
    models[id] = { id, name: id, tool_call: true } as AiProvider["models"][string];
  }
  return {
    id: CUSTOM_PROVIDER_ID,
    name: conn.label || "Custom endpoint",
    api: conn.baseUrl.replace(/\/+$/, ""),
    npm: "@ai-sdk/openai-compatible",
    env: [],
    models,
  } as AiProvider;
}

/** Catalog provider for a saved connection; custom endpoints are built from the connection itself. */
export function resolveConnectionProvider(
  catalog: Catalog,
  conn: { id: string; label: string; providerId: string; baseUrl: string } | null | undefined,
  modelIds: string[] = [],
): AiProvider | null {
  if (!conn) return null;
  if (conn.providerId === CUSTOM_PROVIDER_ID) {
    return conn.baseUrl.trim() ? customProvider(conn, modelIds) : null;
  }
  return catalog[conn.providerId] ?? null;
}
