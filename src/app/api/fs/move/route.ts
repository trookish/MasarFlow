import * as fs from "node:fs";
import * as path from "node:path";
import { resolveInsideRoot, readJsonBody, fail, fsRequestId, logFs } from "../_shared";

// Move (rename) a file inside one linked root. The replica engine uses it to put a deleted
// entity's file in `.masarflow-trash/` instead of deleting it. Both paths are re-validated here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const body = await readJsonBody(req);
    const requestId = fsRequestId(body);
    const root = String(body.root ?? "");
    const from = String(body.from ?? "");
    const to = String(body.to ?? "");
    if (!from || !to) throw { status: 400, message: "Missing from/to" };
    const src = resolveInsideRoot(root, from);
    const dest = resolveInsideRoot(root, to);
    const stat = await fs.promises.stat(src).catch(() => null);
    if (!stat) throw { status: 404, message: `Not found: ${from}` };
    if (stat.isDirectory()) throw { status: 400, message: `Path is a directory: ${from}` };
    if (await fs.promises.stat(dest).catch(() => null)) throw { status: 409, message: `Already exists: ${to}` };
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.rename(src, dest);
    logFs("move", requestId, body, startedAt, { ok: true });
    return Response.json({ ok: true, from, to });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    logFs("move", "unknown", {}, startedAt, { ok: false, error: err?.message ?? "failed", status: err?.status ?? 500 });
    return fail(e);
  }
}
