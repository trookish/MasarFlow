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
import { BlockedUrlError } from "@/lib/server/net-policy";
import { safeFetchText } from "@/lib/server/safe-fetch";

export const runtime = "nodejs";

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

  try {
    const { body, finalUrl } = await safeFetchText(parsed.toString());

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
    if (e instanceof BlockedUrlError) return Response.json({ error: e.message }, { status: 400 });
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
