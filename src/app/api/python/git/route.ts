import { proxyPython } from "../_shared";

export const runtime = "nodejs";

/**
 * Proxies a commit-analysis request to the local Python AI service. Sends
 * `{ sha, message, diff }`; the git-intel backend (Step 4) returns a
 * classification (feat/fix/refactor/…), a summary for Commit.aiSummary, and
 * semantically-suggested spec/task links. Until the backend lands, the
 * service 404s and this returns a graceful { ok: false }.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await proxyPython("/analyze/commit", {
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
