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
 * Same-origin with the local server is assumed (spike S2): keep path + search,
 * drop the ephemeral port, so the top-level navigation follows the redirect.
 */
export function rewriteRedirectToApp(location: string, requestUrl: string): string {
  const resolved = new URL(location, requestUrl);
  return `${APP_ORIGIN}${resolved.pathname}${resolved.search}`;
}
