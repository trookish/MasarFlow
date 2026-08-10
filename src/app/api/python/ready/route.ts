import { describeError, proxyPython } from "../_shared";

export const runtime = "nodejs";

/**
 * Long timeout: the first readiness probe loads the sentence-transformer
 * model (download on first run) inside the Python service, which can take
 * 10-60s+. Abandoned probes are fine — the warmup keeps running server-side.
 */
const READY_TIMEOUT_MS = 90_000;

/** Readiness probe — 200 only once embeddings/search are actually ready. */
export async function GET() {
  try {
    const res = await proxyPython("/ready", { timeoutMs: READY_TIMEOUT_MS });
    const data = (await res.json().catch(() => null)) as {
      ready?: boolean;
      error?: string;
    } | null;
    if (res.ok && data?.ready === true) {
      return Response.json({ ok: true, ready: true, ...data });
    }
    return Response.json(
      {
        ok: false,
        ready: false,
        error: data?.error ?? `Readiness check failed (HTTP ${res.status}).`,
      },
      { status: 200 },
    );
  } catch (e) {
    return Response.json(
      { ok: false, ready: false, error: describeError(e) },
      { status: 200 },
    );
  }
}
