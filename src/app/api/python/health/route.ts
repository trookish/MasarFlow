import { proxyPython } from "../_shared";

export const runtime = "nodejs";

/** Health check for the optional local Python AI service. */
export async function GET() {
  try {
    const res = await proxyPython("/health", { timeoutMs: 2000 });
    if (!res.ok) return Response.json({ ok: false }, { status: 200 });
    const data = await res.json();
    return Response.json({ ok: true, ...data });
  } catch {
    return Response.json({ ok: false }, { status: 200 });
  }
}
