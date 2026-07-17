import { proxyPython } from "../_shared";

export const runtime = "nodejs";

/** Proxies a semantic search query to the local Python AI service. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await proxyPython("/search/semantic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 5000,
    });
    if (!res.ok) {
      return Response.json({ ok: false, error: `Service responded ${res.status}` }, { status: 200 });
    }
    const data = await res.json();
    return Response.json({ ok: true, ...data });
  } catch {
    return Response.json(
      { ok: false, error: "Local AI service is unavailable." },
      { status: 200 },
    );
  }
}
