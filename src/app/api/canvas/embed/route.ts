/**
 * Server-side web embed proxy.
 *
 * Browsers block cross-origin fetches for most pages, so the canvas web-node
 * asks this route to fetch a URL server-side and return extracted metadata:
 * title, description, favicon, thumbnail, and (for articles) reader-mode text.
 *
 * YouTube/video URLs are detected client-side and rendered as iframes — this
 * route is only called for article/github/generic embeds that need server-side
 * extraction.
 */

import type { NextRequest } from "next/server";
import * as http from "node:http";
import * as https from "node:https";

export const runtime = "nodejs";

/** Fetch a URL as text via Node's http/https, with redirects and a timeout. */
function fetchText(
  rawUrl: string,
  maxRedirects = 4,
  timeoutMs = 8000,
): Promise<{ status: number; body: string; contentType: string; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      reject(new Error("Invalid URL"));
      return;
    }

    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(
      target,
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MasarFlow/1.0; +https://masarflow.dev) Canvas-Embed-Bot",
          Accept: "text/html,application/xhtml+xml",
        },
        ...(target.protocol === "https:" ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        // Follow redirects.
        if (
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) &&
          res.headers.location &&
          maxRedirects > 0
        ) {
          const next = new URL(res.headers.location, target).toString();
          res.resume();
          fetchText(next, maxRedirects - 1, timeoutMs).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve({
            status: res.statusCode ?? 200,
            body,
            contentType: res.headers["content-type"] ?? "text/html",
            finalUrl: target.toString(),
          });
        });
        res.on("error", reject);
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Extract <meta> tag content by name or property. */
function metaContent(html: string, key: string): string | null {
  // <meta property="og:..." content="..."> or <meta name="..." content="...">
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

/** Extract the <title> tag. */
function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

/** Extract a favicon URL from <link rel="icon">. */
function faviconUrl(html: string, baseUrl: string): string | null {
  const m =
    html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']*)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
  if (!m) return null;
  try {
    return new URL(m[1], baseUrl).toString();
  } catch {
    return null;
  }
}

/** Extract an og:image thumbnail. */
function thumbnailUrl(html: string, baseUrl: string): string | null {
  const og = metaContent(html, "og:image");
  if (!og) return null;
  try {
    return new URL(og, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Crude article text extraction: strip scripts/styles/tags, collapse whitespace.
 * Not as good as Readability.js, but it runs server-side with no deps and gives
 * the web-node enough to show a reader-mode preview.
 */
function extractReaderText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

interface EmbedResponse {
  url: string;
  title: string;
  description: string;
  favicon: string | null;
  thumbnail: string | null;
  readerText: string;
  siteName: string;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Block loopback / private ranges for safety.
  const host = parsed.hostname;
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
  ) {
    return Response.json({ error: "Blocked: private address" }, { status: 400 });
  }

  try {
    const { body, finalUrl } = await fetchText(url);

    const title =
      metaContent(body, "og:title") ??
      metaContent(body, "twitter:title") ??
      titleTag(body) ??
      parsed.hostname;
    const description =
      metaContent(body, "og:description") ??
      metaContent(body, "description") ??
      metaContent(body, "twitter:description") ??
      "";
    const favicon = faviconUrl(body, finalUrl);
    const thumbnail = thumbnailUrl(body, finalUrl);
    const siteName = metaContent(body, "og:site_name") ?? parsed.hostname;
    const readerText = extractReaderText(body);

    const result: EmbedResponse = {
      url: finalUrl,
      title,
      description,
      favicon,
      thumbnail,
      readerText,
      siteName,
    };
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
