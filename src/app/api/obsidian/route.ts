import type { NextRequest } from "next/server";
import * as http from "node:http";
import * as https from "node:https";

// Node runtime — we need node:http(s) to accept Obsidian's self-signed cert.
export const runtime = "nodejs";

/** Obsidian runs on the same machine; only ever proxy to loopback addresses. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

interface ProxyRequest {
  baseUrl: string;
  apiKey: string;
  method?: string;
  path?: string;
  content?: string;
  contentType?: string;
  accept?: string;
  /** When true, request/response bodies are base64-encoded binary data. */
  binary?: boolean;
}

function forward(opts: {
  baseUrl: string;
  apiKey: string;
  method: string;
  path: string;
  content?: string;
  contentType?: string;
  accept?: string;
  binary?: boolean;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.path, opts.baseUrl);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;

    // For binary writes, decode base64 to a raw Buffer.
    const bodyBuf =
      opts.content != null && opts.binary
        ? Buffer.from(opts.content, "base64")
        : opts.content != null
          ? Buffer.from(opts.content, "utf8")
          : null;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: opts.accept ?? "application/json",
    };
    if (bodyBuf != null) {
      headers["Content-Type"] = opts.contentType ?? "text/markdown";
      headers["Content-Length"] = String(bodyBuf.length);
    }

    const req = lib.request(
      url,
      {
        method: opts.method,
        headers,
        // The plugin uses a self-signed certificate on localhost.
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        if (opts.binary && opts.method === "GET") {
          // Binary read: collect raw bytes and return as base64.
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("base64"),
            }),
          );
        } else {
          // Text read: UTF-8 as before.
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (data += c));
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: data }),
          );
        }
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("Obsidian request timed out")));
    if (bodyBuf != null) req.write(bodyBuf);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  let body: ProxyRequest;
  try {
    body = (await request.json()) as ProxyRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const {
    baseUrl,
    apiKey,
    method = "GET",
    path = "/",
    content,
    contentType,
    accept,
    binary = false,
  } = body;
  if (!baseUrl || !apiKey) {
    return Response.json(
      { ok: false, error: "Missing baseUrl or apiKey" },
      { status: 400 },
    );
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return Response.json({ ok: false, error: "Invalid base URL" }, { status: 400 });
  }
  if (!LOOPBACK.has(url.hostname)) {
    return Response.json(
      { ok: false, error: "Only localhost / 127.0.0.1 targets are allowed." },
      { status: 400 },
    );
  }

  try {
    const res = await forward({
      baseUrl,
      apiKey,
      method,
      path,
      content,
      contentType,
      accept,
      binary,
    });
    return Response.json({
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      body: res.body,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 502 },
    );
  }
}
