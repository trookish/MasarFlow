import { APP_HOST, APP_ORIGIN, APP_SCHEME } from "@shared/security";

/**
 * Rewrite a `masarflow://app/<path>?<query>` request URL into the loopback server URL.
 * Returns null for any other host, scheme or malformed URL (the handler answers 404).
 */
export function rewriteRequestToServer(rawUrl: string, target: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null;
    return `${target.replace(/\/+$/, "")}${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * Re-host a redirect `Location` from the loopback server under `masarflow://app`.
 * Same-origin redirects keep path + search and drop the ephemeral port, so the
 * top-level navigation follows them (spike S2). A cross-origin Location is
 * returned unchanged; the window's navigation policy decides what happens to it.
 */
export function rewriteRedirectToApp(location: string, requestUrl: string): string {
  const resolved = new URL(location, requestUrl);
  if (resolved.origin !== new URL(requestUrl).origin) return resolved.href;
  return `${APP_ORIGIN}${resolved.pathname}${resolved.search}`;
}

/** Statuses for which `new Response(body)` throws if a body is passed (Fetch spec "null body status"). */
export function isNullBodyStatus(status: number): boolean {
  return status === 101 || status === 103 || status === 204 || status === 205 || status === 304;
}
