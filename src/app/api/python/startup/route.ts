import {
  getStartupStatus,
  restartPythonService,
  startPythonService,
} from "@/lib/python/startup";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getStartupStatus());
}

/**
 * Starts the local Python AI service (idempotent — no duplicate spawns).
 * `POST ?action=restart` kills any child and starts over ("Retry now").
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const status =
    searchParams.get("action") === "restart"
      ? await restartPythonService()
      : await startPythonService();
  return Response.json(status);
}
