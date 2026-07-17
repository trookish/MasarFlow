import { proxyPython } from "../_shared";

export const runtime = "nodejs";

const MODALITIES = new Set(["web", "pdf", "office", "image", "audio"]);

/**
 * Proxies a document/file parse request to the local Python AI service. The
 * `modality` field selects the Python sub-path (`/parse/web`, `/parse/pdf`,
 * …). The web reader (trafilatura) lands in Step 1; binary parsers in Step 5;
 * heavy optional ones (image/audio) return 503 until requirements-extra.txt
 * is installed.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }
  const modality = typeof body.modality === "string" ? body.modality : "web";
  if (!MODALITIES.has(modality)) {
    return Response.json({ ok: false, error: `Unknown parse modality: ${modality}` }, { status: 400 });
  }

  try {
    const res = await proxyPython(`/parse/${modality}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 15_000,
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
