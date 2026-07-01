import type { NextRequest } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

// Real filesystem watcher. Streams live file events from a local directory as
// Server-Sent Events using Node's fs.watch (recursive). The dev server runs on
// the user's machine, so this watches their real project folder — no
// simulation. The stream ends when the client disconnects.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Directory segments that are pure noise for a project change feed. */
const IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vs",
  ".idea",
  ".vscode",
  ".obsidian",
  ".trash",
  ".turbo",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  "Library",
  "Temp",
  "Logs",
  "obj",
]);

interface RawEvent {
  path: string;
  kind: "created" | "modified" | "deleted";
}

export async function GET(req: NextRequest): Promise<Response> {
  const dir = req.nextUrl.searchParams.get("dir")?.trim();
  if (!dir) {
    return Response.json({ error: "Missing ?dir= parameter" }, { status: 400 });
  }
  if (!path.isAbsolute(dir)) {
    return Response.json(
      { error: "Directory must be an absolute path" },
      { status: 400 },
    );
  }
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(dir);
  } catch {
    return Response.json({ error: `Directory not found: ${dir}` }, { status: 404 });
  }
  if (!stat.isDirectory()) {
    return Response.json({ error: `Not a directory: ${dir}` }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let watcher: fs.FSWatcher | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: RawEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* stream already closed */
        }
      };

      const emit = async (relPath: string, eventType: string) => {
        const normalized = relPath.split(path.sep).join("/");
        const segments = normalized.split("/");
        if (segments.some((s) => IGNORED_SEGMENTS.has(s))) return;

        let kind: RawEvent["kind"];
        if (eventType === "change") {
          kind = "modified";
        } else {
          // "rename" covers create, delete, and moves — stat disambiguates.
          try {
            await fs.promises.stat(path.join(dir, relPath));
            kind = "created";
          } catch {
            kind = "deleted";
          }
        }
        send({ path: normalized, kind });
      };

      try {
        watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          // Coalesce the burst of duplicate events editors produce per save.
          const key = `${eventType}:${filename}`;
          const existing = pending.get(key);
          if (existing) clearTimeout(existing);
          pending.set(
            key,
            setTimeout(() => {
              pending.delete(key);
              void emit(filename, eventType);
            }, 150),
          );
        });
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: (e as Error).message })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ready: true, dir })}\n\n`));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 15000);
    },
    cancel() {
      watcher?.close();
      if (heartbeat) clearInterval(heartbeat);
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
