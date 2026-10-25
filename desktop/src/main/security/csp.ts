import { FRAME_HOSTS, RENDERER_CONNECT_HOSTS } from "../../shared/embed-hosts";

/**
 * Content-Security-Policy for the renderer.
 * - `connect-src`: the app's own server (packaged: 127.0.0.1 behind the launch token) plus the two public
 *   hosts the renderer reads directly. AI providers, GitHub sync and Obsidian go through `/api/*`.
 * - `frame-src`: only the video players in FRAME_HOSTS; other pages render as link cards.
 * - `img-src` keeps `https:` so favicons, thumbnails and Markdown images from any site display.
 */
export function buildCsp(opts: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "data:", "blob:"],
    "connect-src": [
      "'self'",
      "http://127.0.0.1:*",
      "http://localhost:*",
      ...RENDERER_CONNECT_HOSTS,
      ...(opts.dev ? ["ws://localhost:*"] : []),
    ],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", ...FRAME_HOSTS],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
