/**
 * GET /api/opencode/health — is the OpenCode server reachable? Drives the
 * chat UI's availability banner and the dev launcher. Never throws; returns
 * { ok: false, error } instead.
 */

import { client } from "../_shared";

export async function GET(): Promise<Response> {
  const health = await client().health();
  if (!health?.healthy) {
    return Response.json(
      { ok: false, error: "The AI agent service is unavailable." },
      { status: 200 },
    );
  }
  return Response.json({ ok: true, version: health.version });
}
