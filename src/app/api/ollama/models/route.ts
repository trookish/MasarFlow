// Node runtime — plain fetch to a local-only Ollama server.
export const runtime = "nodejs";

/** Ollama runs on the same machine; only ever proxy to loopback addresses. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

interface OllamaTagsResponse {
  models?: { name: string; size?: number }[];
}

/**
 * Lists models installed on the local Ollama server. No Python service
 * involved — Ollama already speaks HTTP directly.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseUrl = searchParams.get("baseUrl")?.trim() || DEFAULT_OLLAMA_URL;

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return Response.json({ ok: false, error: "Invalid base URL" }, { status: 400 });
  }
  if (!LOOPBACK.has(url.hostname)) {
    return Response.json(
      { ok: false, error: "Only localhost / 127.0.0.1 targets are allowed." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(new URL("/api/tags", url), {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return Response.json(
        { ok: false, error: `Ollama responded ${res.status}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as OllamaTagsResponse;
    const models = (data.models ?? []).map((m) => ({ id: m.name, name: m.name }));
    return Response.json({ ok: true, models });
  } catch {
    return Response.json(
      { ok: false, error: "Could not reach Ollama. Is it running?" },
      { status: 502 },
    );
  }
}
