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

// Search inside a linked project root: filename matches plus case-insensitive
// content matches with line context. Walks are capped (depth-free but
// result/file-size limited) and skip noise directories and secret carriers.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_MATCHES_PER_FILE = 3;

interface SearchHit {
  path: string;
  kind: "name" | "content";
  matches: { line: number; text: string }[];
}

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const body = await readJsonBody(req);
    const requestId = fsRequestId(body);
    const root = String(body.root ?? "");
    const query = String(body.query ?? "").trim();
    const maxResults = Math.min(Number(body.maxResults ?? 40), 200);
    if (!query) throw { status: 400, message: "Missing query" };

    const normRoot = resolveInsideRoot(root, "");
    const q = query.toLowerCase();
    const hits: SearchHit[] = [];
    let scanned = 0;
    const SCAN_CAP = 4000;

    async function walk(dir: string): Promise<void> {
      if (hits.length >= maxResults || scanned >= SCAN_CAP) return;
      const items = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (hits.length >= maxResults || scanned >= SCAN_CAP) return;
        if (item.name.startsWith(".")) continue;
        if (isIgnoredSegment(item.name)) continue;
        const full = path.join(dir, item.name);
        const rel = displayPath(normRoot, full);
        if (isDeniedName(rel)) continue;
        if (item.isDirectory()) {
          await walk(full);
        } else if (item.isFile()) {
          scanned++;
          if (item.name.toLowerCase().includes(q)) {
            hits.push({ path: rel, kind: "name", matches: [] });
            continue;
          }
          const stat = await fs.promises.stat(full).catch(() => null);
          if (!stat || stat.size > MAX_FILE_BYTES) continue;
          const buf = await fs.promises.readFile(full);
          if (buf.subarray(0, 8192).includes(0)) continue; // binary
          const lines = buf.toString("utf8").split("\n");
          const matches: { line: number; text: string }[] = [];
          for (
            let i = 0;
            i < lines.length && matches.length < MAX_MATCHES_PER_FILE;
            i++
          ) {
            if (lines[i].toLowerCase().includes(q)) {
              matches.push({
                line: i + 1,
                text: lines[i].trim().slice(0, 200),
              });
            }
          }
          if (matches.length)
            hits.push({ path: rel, kind: "content", matches });
        }
      }
    }

    await walk(normRoot);
    logFs("search", requestId, body, startedAt, { ok: true });
    return Response.json({
      ok: true,
      hits,
      truncated: hits.length >= maxResults || scanned >= SCAN_CAP,
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    logFs("search", "unknown", {}, startedAt, {
      ok: false,
      error: err?.message ?? "failed",
      status: err?.status ?? 500,
    });
    return fail(e);
  }
}
