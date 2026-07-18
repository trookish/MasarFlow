import * as fs from "node:fs";
import { resolveInsideRoot, readJsonBody, fail } from "../_shared";

// Read a text file inside a linked project root. Size-capped with head
// truncation; binary files are detected and refused (the agent gets a clear
// signal instead of garbage bytes).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNIFF_BYTES = 8192;

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJsonBody(req);
    const root = String(body.root ?? "");
    const rel = String(body.path ?? "");
    const maxBytes = Math.min(Number(body.maxBytes ?? 65536), 512 * 1024);
    if (!rel) throw { status: 400, message: "Missing path" };

    const abs = resolveInsideRoot(root, rel);
    const stat = await fs.promises.stat(abs).catch(() => null);
    if (!stat) throw { status: 404, message: `File not found: ${rel}` };
    if (!stat.isFile()) throw { status: 400, message: `Not a file: ${rel}` };

    const handle = await fs.promises.open(abs, "r");
    try {
      const sniffLen = Math.min(SNIFF_BYTES, stat.size);
      const sniff = Buffer.alloc(sniffLen);
      await handle.read(sniff, 0, sniffLen, 0);
      if (sniff.includes(0)) {
        return Response.json({
          ok: true,
          binary: true,
          path: rel,
          size: stat.size,
          content: "",
          truncated: false,
        });
      }

      const readLen = Math.min(stat.size, maxBytes);
      const buf = Buffer.alloc(readLen);
      await handle.read(buf, 0, readLen, 0);
      return Response.json({
        ok: true,
        binary: false,
        path: rel,
        size: stat.size,
        content: buf.toString("utf8"),
        truncated: stat.size > maxBytes,
      });
    } finally {
      await handle.close();
    }
  } catch (e) {
    return fail(e);
  }
}
