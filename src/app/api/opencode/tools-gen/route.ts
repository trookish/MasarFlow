/**
 * GET /api/opencode/tools-gen?secret=<bridge secret> — the generated
 * opencode custom-tool files for every workspace function, as JSON.
 *
 * scripts/start.mjs fetches this after Next is healthy (before spawning
 * `opencode serve`) and writes the files into the project's and the global
 * opencode tools directories, so the running server registers
 * create_note/read_spec/… as real tools. The secret is required so the
 * endpoint never leaks the baked-in bridge secret to random callers.
 */

import { allWorkspaceToolFiles } from "@/lib/opencode/toolgen";

import { logRequest } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The URL baked into the generated tools, pointing back at this server. */
function bridgeUrl(): string {
  const override = process.env.MASARFLOW_BRIDGE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  const port = process.env.PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}`;
}

export async function GET(req: Request): Promise<Response> {
  const requestId = `toolsgen_${crypto.randomUUID().slice(0, 8)}`;
  const secret = new URL(req.url).searchParams.get("secret") ?? "";
  const expected = process.env.MASARFLOW_BRIDGE_SECRET;
  if (!expected || secret !== expected) {
    logRequest(requestId, "tools-gen unauthorized", {});
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const files = allWorkspaceToolFiles({
    bridgeUrl: bridgeUrl(),
    secret: expected,
  });
  logRequest(requestId, "tools generated", {
    count: files.length,
    bridgeUrl: bridgeUrl(),
  });
  return Response.json({
    ok: true,
    files,
    toolNames: files.map((f) => f.name),
  });
}
