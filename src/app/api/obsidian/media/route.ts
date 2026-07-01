import type { NextRequest } from "next/server";
import * as http from "node:http";
import * as https from "node:https";

export const runtime = "nodejs";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export async function GET(request: NextRequest) {
  const urlParams = request.nextUrl.searchParams;
  const baseUrl = urlParams.get("baseUrl");
  const apiKey = urlParams.get("apiKey");
  const path = urlParams.get("path");

  if (!baseUrl || !apiKey || !path) {
    return new Response("Missing baseUrl, apiKey, or path", { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(baseUrl);
  } catch {
    return new Response("Invalid base URL", { status: 400 });
  }

  if (!LOOPBACK.has(targetUrl.hostname)) {
    return new Response("Only localhost / 127.0.0.1 targets are allowed.", { status: 400 });
  }

  // Obsidian REST API file endpoint
  const obsUrl = new URL(`/vault/${path.split('/').map(encodeURIComponent).join('/')}`, baseUrl);
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
        ...(isHttps ? { rejectUnauthorized: false } : {}),
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

        // Create a Web ReadableStream from the Node.js IncomingMessage
        const stream = new ReadableStream({
          start(controller) {
            res.on("data", (chunk) => controller.enqueue(chunk));
            res.on("end", () => controller.close());
            res.on("error", (err) => controller.error(err));
          },
          cancel() {
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
