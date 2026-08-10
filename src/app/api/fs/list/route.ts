import * as fs from "node:fs";
import * as path from "node:path";
import {
  resolveInsideRoot,
  readJsonBody,
  fail,
  displayPath,
  isIgnoredSegment,
  isDeniedName,
  fsRequestId,
  logFs,
} from "../_shared";

// List a directory tree inside a linked project root. Depth-capped and
// entry-capped so the agent can orient itself without flooding the context.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Entry {
  path: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
}

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const body = await readJsonBody(req);
    const requestId = fsRequestId(body);
    const root = String(body.root ?? "");
    const rel = String(body.path ?? "");
    const depth = Math.min(Math.max(Number(body.depth ?? 2), 0), 6);
    const maxEntries = Math.min(Number(body.maxEntries ?? 400), 2000);

    const resolveRoot = path.resolve(root);
    const abs = resolveInsideRoot(root, rel);
    const stat = await fs.promises.stat(abs).catch(() => null);
    if (!stat?.isDirectory()) {
      throw { status: 404, message: `Not a directory: ${rel || "/"}` };
    }

    const entries: Entry[] = [];
    let truncated = false;

    async function walk(dir: string, level: number): Promise<void> {
      if (level > depth || entries.length >= maxEntries) {
        if (level <= depth) truncated = true;
        return;
      }
      const items = await fs.promises.readdir(dir, { withFileTypes: true });
      items.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory())
          return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const item of items) {
        if (entries.length >= maxEntries) {
          truncated = true;
          return;
        }
        if (item.name.startsWith(".") && item.name !== ".gitignore") continue;
        if (isIgnoredSegment(item.name)) continue;
        const full = path.join(dir, item.name);
        const relPath = displayPath(resolveRoot, full);
        if (isDeniedName(relPath)) continue;
        if (item.isDirectory()) {
          entries.push({ path: relPath, type: "dir", size: 0, mtime: 0 });
          await walk(full, level + 1);
        } else if (item.isFile()) {
          const s = await fs.promises.stat(full).catch(() => null);
          entries.push({
            path: relPath,
            type: "file",
            size: s?.size ?? 0,
            mtime: s?.mtimeMs ?? 0,
          });
        }
      }
    }

    await walk(abs, rel ? 0 : 0);
    logFs("list", requestId, body, startedAt, { ok: true });
    return Response.json({ ok: true, entries, truncated });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    logFs("list", "unknown", {}, startedAt, {
      ok: false,
      error: err?.message ?? "failed",
      status: err?.status ?? 500,
    });
    return fail(e);
  }
}
