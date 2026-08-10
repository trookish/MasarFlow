// Shared helpers for the /api/fs/* routes — the sandbox that keeps the
// agentic filesystem tools inside user-linked project roots. Not a route
// itself (no exported HTTP handlers), so the Next.js router ignores it.
//
// Security model: every request carries the absolute `root` of a folder the
// user explicitly linked in the UI. Each route resolves the requested path
// against that root and rejects anything that escapes it (traversal, UNC
// tricks, absolute-path overrides). Dangerous operations (write, shell) are
// additionally gated by per-action user approval on the client.
import * as path from "node:path";

/** Directory segments skipped while walking (noise or huge). */
export const IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vs",
  ".idea",
  ".vscode",
  ".obsidian",
  ".trash",
  ".turbo",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "Library", // Unity
  "Temp",
  "Logs",
  "obj",
  "bin",
]);

/** Names that must never be listed/read/searched — secret carriers. */
const DENIED_FILE =
  /(^|[/\\])\.env(\.|$)|(^|[/\\])[^/\\]*\.(pem|key|p12|pfx)$|(^|[/\\])id_(rsa|dsa|ecdsa|ed25519)(\.|$)|(^|[/\\])secrets?\.(json|ya?ml|env)$/i;

export function isDeniedName(relPath: string): boolean {
  return DENIED_FILE.test(relPath);
}

export function isIgnoredSegment(segment: string): boolean {
  return IGNORED_SEGMENTS.has(segment);
}

/**
 * Resolve `rel` inside `root`, rejecting escapes. Returns the absolute,
 * normalized target path. Throws { status, message } on violations.
 */
export function resolveInsideRoot(root: string, rel: string): string {
  if (!root || !path.isAbsolute(root)) {
    throw { status: 400, message: "root must be an absolute path" };
  }
  const normRoot = path.resolve(root);
  // Treat the incoming path as relative even if it sneaks in as absolute:
  // strip drive letters / leading slashes so it can never escape the root.
  const stripped = rel.replace(/^([a-zA-Z]:[\\/]*|[\\/]+|~[\\/]*)/, "");
  const target = path.resolve(normRoot, stripped);
  if (target !== normRoot && !target.startsWith(normRoot + path.sep)) {
    throw { status: 403, message: "Path escapes the linked project root" };
  }
  if (isDeniedName(stripped)) {
    throw {
      status: 403,
      message: "This file is excluded (may contain secrets)",
    };
  }
  return target;
}

/** Parse and lightly validate a JSON POST body. Throws {status,message}. */
export async function readJsonBody<T = Record<string, unknown>>(
  req: Request,
): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw { status: 400, message: "Invalid request body" };
  }
}

/** Turn a thrown {status,message} (or anything else) into a JSON response. */
export function fail(e: unknown): Response {
  const err = e as { status?: number; message?: string };
  return Response.json(
    { ok: false, error: err?.message ?? "Filesystem operation failed" },
    { status: err?.status ?? 500 },
  );
}

/** Relativize for display: forward slashes, no leading slash. */
export function displayPath(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

/* ── Request correlation & logging ────────────────────────────────────── */

/**
 * A short id that correlates an agent's tool call with its server-side
 * execution. The agent client sends its request id in the body; fs routes
 * echo it in every log line. Never derived from anything sensitive.
 */
export function fsRequestId(body: Record<string, unknown>): string {
  const incoming = String(body.requestId ?? "");
  if (incoming && /^[A-Za-z0-9_-]{1,64}$/.test(incoming)) return incoming;
  return `fs_${crypto.randomUUID().slice(0, 8)}`;
}

/** One structured [fs] log line: op, root label, duration, outcome. */
export function logFs(
  op: string,
  requestId: string,
  body: Record<string, unknown>,
  startedAt: number,
  outcome: { ok: boolean; error?: string; status?: number },
): void {
  const root = String(body.root ?? "");
  const label =
    root
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .pop() ?? root;
  console.log(
    `[fs:${requestId}] ${op} completed`,
    JSON.stringify({
      root: label,
      durationMs: Date.now() - startedAt,
      ok: outcome.ok,
      error: outcome.error ?? null,
      status: outcome.status ?? 200,
    }),
  );
}
