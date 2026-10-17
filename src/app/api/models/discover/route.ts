// Node runtime — plain fetch to a user-supplied OpenAI-compatible endpoint.
export const runtime = "nodejs";

/** Only `http:`/`https:` base URLs are accepted (no `file:`, no other schemes). */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Discovers the model ids an OpenAI-compatible endpoint exposes at
 * `GET {baseUrl}/models` (the OpenAI shape `{ data: [{ id }] }`).
 *
 * The browser must never call a user URL directly (CORS), so the connections
 * dialog and the model picker go through this proxy instead. Requests are
 * bounded by an 8s timeout.
 */
export async function POST(request: Request) {
  let body: { baseUrl?: unknown; apiKey?: unknown };
  try {
    body = (await request.json()) as { baseUrl?: unknown; apiKey?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  if (!baseUrl) {
    return Response.json({ error: "baseUrl is required." }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return Response.json({ error: "Invalid base URL." }, { status: 400 });
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return Response.json(
      { error: "Only http: and https: base URLs are allowed." },
      { status: 400 },
    );
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return Response.json(
        { error: `The endpoint responded ${res.status}.` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { data?: { id?: unknown }[] };
    const models = (data.data ?? [])
      .map((m) => (typeof m.id === "string" ? m.id : ""))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return Response.json({ models });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: `Could not reach the endpoint (${msg}).` },
      { status: 502 },
    );
  }
}
