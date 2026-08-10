/**
 * GET /api/opencode/tools — the tools the OpenCode server actually registers
 * (read, glob, grep, bash, edit, write, webfetch, …). The chat uses this so
 * the agentic prompt lists the REAL tool names and descriptions instead of
 * hardcoded ones that may not match the server's build. Cached briefly.
 *
 * Response: { tools: [{ id, description }], cached }
 */

import { opencodeConfig } from "@/lib/opencode/config";

import { client, errorResponse, logRequest } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface OpenCodeToolInfo {
  id: string;
  description: string;
}

let cache: { at: number; tools: OpenCodeToolInfo[] } | null = null;
const TTL_MS = 300_000;

export async function GET(): Promise<Response> {
  const requestId = `tools_${crypto.randomUUID().slice(0, 8)}`;
  if (cache && Date.now() - cache.at < TTL_MS) {
    return Response.json({ tools: cache.tools, cached: true });
  }

  try {
    const config = opencodeConfig();
    const oc = client();
    // /experimental/tool wants a provider + model; use the first connected
    // one (the tool set is server-wide, only the descriptions are returned).
    const connected = await oc.connectedModels();
    const first = connected[0];
    if (!first) {
      return Response.json({ tools: [], cached: false });
    }
    const model = first.models[0]?.id;
    const params = new URLSearchParams({ directory: config.workspaceDir });
    if (first.provider.id) params.set("provider", first.provider.id);
    if (model) params.set("model", model);

    const raw = await oc.request<OpenCodeToolInfo[]>(
      `/experimental/tool?${params.toString()}`,
      { timeoutMs: 5000 },
    );
    const tools = (Array.isArray(raw) ? raw : [])
      .map((t) => ({
        id: String(t?.id ?? ""),
        description: String(t?.description ?? "")
          .replace(/\s+/g, " ")
          .trim(),
      }))
      .filter((t) => t.id && t.id !== "invalid");
    cache = { at: Date.now(), tools };
    logRequest(requestId, "tools fetched", { count: tools.length });
    return Response.json({ tools, cached: false });
  } catch (e) {
    cache = null;
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}
