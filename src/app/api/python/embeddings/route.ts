import { proxyPython } from "../_shared";

export const runtime = "nodejs";

/**
 * Proxies a full-replace embedding sync for one project to the Python
 * service. Fire-and-forget from the client's perspective — the Python side
 * enqueues the work and returns 202 immediately.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await proxyPython("/embeddings/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 5000,
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { ok: false, error: "Local AI service is unavailable." },
      { status: 200 },
    );
  }
}
