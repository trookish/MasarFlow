import type { NextRequest } from "next/server";
import * as http from "node:http";
import * as https from "node:https";
import { MEDIA_SESSION_TTL_MS, createMediaSession, getMediaSession } from "@/lib/server/media-sessions";

export const runtime = "nodejs";

import { OBSIDIAN_LOOPBACK as LOOPBACK, obsidianTlsOptions, obsidianUrl } from "@/lib/server/obsidian-target";

function loopbackUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    return LOOPBACK.has(u.hostname) && (u.protocol === "https:" || u.protocol === "http:") ? u : null;
  } catch {
    return null;
  }
}

/**
 * Exchange the Obsidian connection for a media session id (the API key travels in the body only).
 * Body: `{ baseUrl, apiKey }` → `{ session, expiresInMs }`.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { baseUrl?: unknown; apiKey?: unknown } | null;
  const base = loopbackUrl(body?.baseUrl);
  if (!base) return Response.json({ error: "Only localhost / 127.0.0.1 targets are allowed." }, { status: 400 });
  if (typeof body?.apiKey !== "string" || !body.apiKey.trim()) {
    return Response.json({ error: "Missing apiKey" }, { status: 400 });
  }
  return Response.json({ session: createMediaSession(base.toString(), body.apiKey), expiresInMs: MEDIA_SESSION_TTL_MS });
}

/** Stream one vault file: `?session=<id>&path=<vault path>`. */
export async function GET(request: NextRequest) {
  const urlParams = request.nextUrl.searchParams;
  if (urlParams.has("apiKey")) {
    return new Response("API keys are not accepted in URLs. Request a media session first.", { status: 400 });
  }
  const path = urlParams.get("path");
  const session = getMediaSession(urlParams.get("session"));
  if (!path) return new Response("Missing path", { status: 400 });
  if (!session) return new Response("Media session expired or unknown", { status: 401 });
  const { baseUrl, apiKey } = session;

  // Obsidian REST API file endpoint
  const obsUrl = obsidianUrl(`/vault/${path.split("/").map(encodeURIComponent).join("/")}`, baseUrl);
  const isHttps = obsUrl.protocol === "https:";
  const lib = isHttps ? https : http;

  // We forward the Range header if present (important for video seeking)
  const rangeHeader = request.headers.get("range");
  const reqHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/octet-stream",
  };
  if (rangeHeader) {
    reqHeaders["Range"] = rangeHeader;
  }

  return new Promise<Response>((resolve) => {
    const req = lib.request(
      obsUrl,
      {
        method: "GET",
        headers: reqHeaders,
        ...obsidianTlsOptions(obsUrl),
      },
      (res) => {
        // Build the headers to return
        const responseHeaders = new Headers();
        if (res.headers["content-type"]) {
          responseHeaders.set("Content-Type", res.headers["content-type"]);
        }
        if (res.headers["content-length"]) {
          responseHeaders.set("Content-Length", res.headers["content-length"]);
        }
        if (res.headers["accept-ranges"]) {
          responseHeaders.set("Accept-Ranges", res.headers["accept-ranges"]);
        }
        if (res.headers["content-range"]) {
          responseHeaders.set("Content-Range", res.headers["content-range"]);
        }

        // Create a Web ReadableStream from the Node.js IncomingMessage. A client can
        // cancel mid-transfer (the player seeks or closes); events after that must not
        // touch the closed controller, or the throw escapes as an uncaught exception.
        let done = false;
        const stream = new ReadableStream({
          start(controller) {
            res.on("data", (chunk) => {
              if (done) return;
              try {
                controller.enqueue(chunk);
              } catch {
                done = true;
              }
            });
            res.on("end", () => {
              if (done) return;
              done = true;
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            });
            res.on("error", (err) => {
              if (done) return;
              done = true;
              controller.error(err);
            });
          },
          cancel() {
            done = true;
            req.destroy();
          },
        });

        resolve(
          new Response(stream, {
            status: res.statusCode ?? 200,
            headers: responseHeaders,
          }),
        );
      },
    );

    req.on("error", (e) => {
      resolve(new Response((e as Error).message, { status: 502 }));
    });
    
    req.end();
  });
}
