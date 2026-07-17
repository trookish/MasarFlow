import { proxyPython } from "../_shared";

export const runtime = "nodejs";

const MODES = new Set(["file", "directory"]);

/**
 * Proxies a code-analysis request to the local Python AI service. `mode`
 * selects the Python sub-path: "file" (one source file → violations,
 * complexity, symbols) or "directory" (a root → import/call dependency
 * graph). The tree-sitter backend lands in Step 3; until then the service
 * 404s and this returns a graceful { ok: false }.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }
  const mode = typeof body.mode === "string" ? body.mode : "file";
  if (!MODES.has(mode)) {
    return Response.json({ ok: false, error: `Unknown analyze mode: ${mode}` }, { status: 400 });
  }

  try {
    const res = await proxyPython(`/analyze/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 10_000,
    });
    if (!res.ok) {
      return Response.json({ ok: false, error: `Service responded ${res.status}` }, { status: 200 });
    }
    const data = await res.json();
    return Response.json({ ok: true, ...data });
  } catch {
    return Response.json({ ok: false, error: "Local AI service is unavailable." }, { status: 200 });
  }
}
