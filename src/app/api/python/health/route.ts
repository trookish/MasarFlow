import { describeError, proxyPython } from "../_shared";
import { getPythonServiceUrl } from "@/lib/python/service-url";

export const runtime = "nodejs";

/** Health check for the local Python AI service. */
export async function GET() {
  try {
    const res = await proxyPython("/health", { timeoutMs: 1500 });
    if (!res.ok) return Response.json({ ok: false }, { status: 200 });
    const data = await res.json();
    return Response.json({ ok: true, ...data });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: describeError(e),
        serviceUrl: getPythonServiceUrl(),
      },
      { status: 200 },
    );
  }
}
