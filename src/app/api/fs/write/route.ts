import * as fs from "node:fs";
import * as path from "node:path";
import {
  resolveInsideRoot,
  readJsonBody,
  fail,
  fsRequestId,
  logFs,
} from "../_shared";

// Write (create or overwrite) a UTF-8 text file inside a linked project root.
// Reached only after explicit user approval on the client (opencode-style
// permission flow) — this route still re-validates the path server-side.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT_BYTES = 1024 * 1024; // 1MB per write

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const body = await readJsonBody(req);
    const requestId = fsRequestId(body);
    const root = String(body.root ?? "");
    const rel = String(body.path ?? "");
    const content = String(body.content ?? "");
    if (!rel) throw { status: 400, message: "Missing path" };
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_CONTENT_BYTES) {
      throw { status: 413, message: "Content too large (max 1MB per write)" };
    }

    const abs = resolveInsideRoot(root, rel);
    const before = await fs.promises.stat(abs).catch(() => null);
    if (before?.isDirectory()) {
      throw { status: 400, message: `Path is a directory: ${rel}` };
    }

    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, content, "utf8");

    logFs("write", requestId, body, startedAt, { ok: true });
    return Response.json({
      ok: true,
      path: rel,
      bytes,
      created: !before,
      previousBytes: before?.size ?? 0,
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    logFs("write", "unknown", {}, startedAt, {
      ok: false,
      error: err?.message ?? "failed",
      status: err?.status ?? 500,
    });
    return fail(e);
  }
}
