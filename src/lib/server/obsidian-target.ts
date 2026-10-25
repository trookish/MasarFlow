import type { RequestOptions } from "node:https";

/** Obsidian runs on the same machine; MasarFlow only ever talks to it over loopback. */
export const OBSIDIAN_LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isObsidianLoopback(url: URL): boolean {
  return (url.protocol === "https:" || url.protocol === "http:") && OBSIDIAN_LOOPBACK.has(url.hostname);
}

/**
 * Resolve `path` against the Obsidian base URL and require the result to stay on loopback, so a path
 * such as `//evil.test/x` cannot redirect the request (and its API key) to another host.
 */
export function obsidianUrl(path: string, baseUrl: string): URL {
  const url = new URL(path, baseUrl);
  if (!isObsidianLoopback(url)) throw new Error("Only localhost / 127.0.0.1 targets are allowed.");
  return url;
}

/**
 * TLS options for a request to the Obsidian Local REST API. The plugin serves a self-signed certificate
 * generated on the user's machine, so it cannot chain to a public CA. Certificate checks are relaxed
 * ONLY for loopback targets, where there is no network path for an interceptor; any other host throws.
 */
export function obsidianTlsOptions(url: URL): Pick<RequestOptions, "rejectUnauthorized"> {
  if (!isObsidianLoopback(url)) throw new Error("Only localhost / 127.0.0.1 targets are allowed.");
  return url.protocol === "https:" ? { rejectUnauthorized: false } : {};
}
