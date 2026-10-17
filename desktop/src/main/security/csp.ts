/**
 * Content-Security-Policy for the renderer.
 * TODO(P9.T6): audit browser-side fetch() calls and narrow `connect-src` from `https:` to the providers actually used.
 */
export function buildCsp(opts: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'", "https:", "http://127.0.0.1:*", "http://localhost:*", ...(opts.dev ? ["ws://localhost:*"] : [])],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "https:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
