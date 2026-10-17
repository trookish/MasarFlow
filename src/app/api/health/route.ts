export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness probe used by the Electron main process to know the server is up. */
export async function GET(): Promise<Response> {
  return Response.json({ ok: true, version: process.env.MASARFLOW_VERSION ?? "dev" });
}
