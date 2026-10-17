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

/** The slice of Electron's IncomingMessage the proxy reads (an EventEmitter). */
export interface IncomingBody {
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

/**
 * Wrap a loopback response body as a web stream for `protocol.handle`.
 *
 * The renderer can cancel a response at any time (reload, navigation, an aborted
 * fetch, a closed window) while the server is still sending. Enqueueing into the
 * closed controller then throws ERR_INVALID_STATE from an event listener, which
 * Electron reports as an uncaught main-process exception (a modal error dialog).
 * So every event after cancel/end/error is ignored, and cancel aborts the
 * upstream request so the server stops sending.
 */
export function streamFromIncoming(resp: IncomingBody, abort: () => void): ReadableStream<Uint8Array> {
  let done = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      resp.on("data", (chunk) => {
        if (done) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          done = true; // closed underneath us; drop the rest
        }
      });
      resp.on("end", () => {
        if (done) return;
        done = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
      resp.on("error", (error) => {
        if (done) return;
        done = true;
        try {
          controller.error(error);
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      done = true;
      try {
        abort();
      } catch {
        // the request may already be finished
      }
    },
  });
}
