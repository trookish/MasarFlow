import { net, protocol } from "electron";
import { Readable } from "node:stream";
import { APP_ORIGIN, APP_SCHEME, TOKEN_HEADER } from "@shared/security";
import { buildCsp } from "../security/csp";
import { isNullBodyStatus, rewriteRedirectToApp, rewriteRequestToServer, streamFromIncoming } from "./protocol-url";

/** MUST be called before `app` is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export interface AppProtocolOptions {
  /** Origin of the loopback server, e.g. `http://127.0.0.1:41000`. */
  target: string;
  /** Per-launch secret handed to the server on every proxied request. */
  token: string;
}

/**
 * Proxy masarflow://app/* to the loopback server, adding the launch token.
 *
 * Built on `net.request`, not `net.fetch`: `net.fetch` cannot pass a 3xx through
 * (`redirect: "manual"` dies with "Redirect was cancelled", electron/electron#43715;
 * `"follow"` hides the redirect from the page and the URL never leaves `/`).
 * The `redirect` event instead re-hosts the Location under masarflow://app — a
 * handler-returned 3xx IS followed by the top-level navigation (spike S2).
 */
export function installAppProtocol(opts: AppProtocolOptions): void {
  protocol.handle(APP_SCHEME, (request) => {
    const targetUrl = rewriteRequestToServer(request.url, opts.target);
    if (!targetUrl) return new Response("Not found", { status: 404 });

    const headers = new Headers(request.headers);
    headers.set(TOKEN_HEADER, opts.token);
    // Chromium does not send an Origin for fetches made from the custom scheme
    // (the smoke run showed guard 403 "state-changing requests must carry an
    // allowed origin"), so assert the app origin here. This proxy is the only
    // entry point to the loopback server.
    if (request.method !== "GET" && request.method !== "HEAD") headers.set("origin", APP_ORIGIN);

    return new Promise<Response>((resolve, reject) => {
      const req = net.request({
        url: targetUrl,
        method: request.method,
        redirect: "manual",
        headers: Object.fromEntries(headers),
        bypassCustomProtocolHandlers: true,
      });
      let settled = false;

      req.on("redirect", (statusCode, _method, redirectUrl) => {
        if (settled) return;
        settled = true;
        // The event only fires with a 3xx status; Response.redirect accepts 301/302/303/307/308.
        resolve(Response.redirect(rewriteRedirectToApp(redirectUrl, targetUrl), statusCode as 301 | 302 | 303 | 307 | 308));
        req.abort();
      });

      req.on("response", (resp) => {
        if (settled) return;
        settled = true;
        const responseHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(resp.headers)) {
          responseHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
        }
        // HTML documents come from the loopback server; stamp the renderer CSP on them.
        const contentType = Object.entries(responseHeaders).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
        if (contentType.includes("text/html")) {
          responseHeaders["content-security-policy"] = buildCsp({ dev: false });
        }
        const init = { status: resp.statusCode, statusText: resp.statusMessage, headers: responseHeaders };
        // 204/304 etc. must not carry a body or `new Response` throws (Next sends 304 for cached assets).
        if (isNullBodyStatus(resp.statusCode)) {
          resp.on("data", () => {}); // drain so the request completes
          resolve(new Response(null, init));
          return;
        }
        resolve(new Response(streamFromIncoming(resp, () => req.abort()), init));
      });

      req.on("error", (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });

      // `duplex`/pipe: ClientRequest is not typed as a Writable even though it
      // implements the interface at runtime (verified in spike S2).
      if (request.body) Readable.fromWeb(request.body).pipe(req as unknown as NodeJS.WritableStream);
      else req.end();
    });
  });
}
