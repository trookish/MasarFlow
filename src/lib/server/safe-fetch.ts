import * as http from "node:http";
import * as https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { assertPublicUrl, BlockedUrlError, type HostResolver } from "@/lib/server/net-policy";

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** One HTTP request to `url`, connected to `pinned` (an already-vetted IP). No redirects. */
export type Transport = (url: URL, pinned: string, opts: { timeoutMs: number; maxBytes: number }) => Promise<RawResponse>;

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export const nodeTransport: Transport = (url, pinned, { timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    const family = isIP(pinned) || 4;
    const pinnedLookup = ((_host: string, options: { all?: boolean } | undefined, cb: (...args: unknown[]) => void) => {
      if (options?.all) cb(null, [{ address: pinned, family }]);
      else cb(null, pinned, family);
    }) as unknown as LookupFunction;
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: pinnedLookup,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MasarFlow/1.0) Canvas-Embed-Bot",
          Accept: "text/html,application/xhtml+xml",
        },
      },
      (res) => {
        if (REDIRECTS.has(res.statusCode ?? 0)) {
          res.resume();
          resolve({ status: res.statusCode ?? 302, headers: res.headers, body: "" });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new Error("Response too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 200, headers: res.headers, body: Buffer.concat(chunks).toString("utf-8") }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.end();
  });

export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  resolve?: HostResolver;
  transport?: Transport;
}

/**
 * GET a public URL as text. Every hop — the first request and each redirect — is resolved, checked
 * against the private-network policy and pinned to the vetted address. TLS is always verified.
 */
export async function safeFetchText(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<{ status: number; body: string; contentType: string; finalUrl: string }> {
  const { maxRedirects = 3, timeoutMs = 8000, maxBytes = 2 * 1024 * 1024, resolve, transport = nodeTransport } = opts;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("Invalid URL");
  }
  for (let hop = 0; ; hop++) {
    const pinned = await assertPublicUrl(url, resolve);
    const res = await transport(url, pinned, { timeoutMs, maxBytes });
    const location = res.headers.location;
    if (REDIRECTS.has(res.status) && typeof location === "string" && location) {
      if (hop >= maxRedirects) throw new Error("Too many redirects");
      url = new URL(location, url);
      continue;
    }
    const ct = res.headers["content-type"];
    return {
      status: res.status,
      body: res.body,
      contentType: (Array.isArray(ct) ? ct[0] : ct) ?? "text/html",
      finalUrl: url.toString(),
    };
  }
}
