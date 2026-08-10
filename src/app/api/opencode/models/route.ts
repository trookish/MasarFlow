/**
 * GET /api/opencode/models — connected providers and their models from the
 * OpenCode server, cached briefly. Only ids/names/capabilities are returned —
 * keys never leave OpenCode and nothing here is sent to the browser except
 * picker metadata.
 *
 * Response: { providers: [{ providerId, providerName, models: [{id, name,
 *            capabilities}] }], cached, updatedAt }
 */

import { opencodeConfig } from "@/lib/opencode/config";

import { client, errorResponse, logRequest } from "../_shared";
import {
  getCachedModels,
  resetModelsCacheForTests,
  setCachedModels,
} from "./cache";
import type { OpenCodeModelsResponse } from "./types";

export async function GET(): Promise<Response> {
  const requestId = `models_${crypto.randomUUID().slice(0, 8)}`;
  const ttl = opencodeConfig().modelCacheTtlMs;
  const cached = getCachedModels();
  if (cached && Date.now() - cached.at < ttl) {
    return Response.json({ ...cached.payload, cached: true });
  }

  try {
    const connected = await client().connectedModels();
    const payload: OpenCodeModelsResponse = {
      providers: connected.map(({ provider, models }) => ({
        providerId: provider.id,
        providerName: provider.name,
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          capabilities: {
            reasoning: m.capabilities?.reasoning ?? false,
            attachment: m.capabilities?.attachment ?? false,
            toolcall: m.capabilities?.toolcall ?? false,
          },
        })),
      })),
    };
    setCachedModels(payload);
    logRequest(requestId, "models fetched", {
      providers: payload.providers.length,
    });
    return Response.json({ ...payload, cached: false });
  } catch (e) {
    resetModelsCacheForTests();
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}
