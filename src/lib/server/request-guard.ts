import { timingSafeEqual } from "node:crypto";

export const TOKEN_HEADER = "x-masarflow-token";

export interface GuardConfig {
  /** Per-launch secret known only to Electron main. */
  token: string;
  /** Exact `Host` header values the server may be addressed as. */
  allowedHosts: string[];
  /** Exact `Origin` values allowed to call the API. */
  allowedOrigins: string[];
}

export interface GuardRequest {
  method: string;
  pathname: string;
  host: string | null;
  origin: string | null;
  token: string | null;
}

export type GuardResult = { ok: true } | { ok: false; status: 401 | 403; reason: string };

const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

function safeEqual(expected: string, actual: string | null): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

const deny = (status: 401 | 403, why: string): GuardResult => ({ ok: false, status, reason: `MasarFlow guard: ${why}` });

export function checkRequest(cfg: GuardConfig, r: GuardRequest): GuardResult {
  const host = r.host?.toLowerCase() ?? "";
  if (!host || !cfg.allowedHosts.includes(host)) return deny(403, "host not allowed");

  if (!safeEqual(cfg.token, r.token)) return deny(401, "missing or invalid launch token");

  if (r.origin !== null) {
    if (!cfg.allowedOrigins.includes(r.origin)) return deny(403, "origin not allowed");
  } else if (!READ_ONLY.has(r.method.toUpperCase())) {
    return deny(403, "state-changing requests must carry an allowed origin");
  }
  return { ok: true };
}

/** Enforcement is on only when Electron main set a launch token (packaged app). */
export function guardConfigFromEnv(env: Record<string, string | undefined>): GuardConfig | null {
  const token = env.MASARFLOW_TOKEN?.trim();
  if (!token) return null;
  const port = env.PORT?.trim() || "3000";
  return {
    token,
    allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
    allowedOrigins: ["masarflow://app"],
  };
}

export interface DevGuardRequest extends GuardRequest {
  /** `Sec-Fetch-Site` header; browsers set it on every fetch. */
  fetchSite: string | null;
}

/**
 * Guard for development (`pnpm dev`: `next dev` behind Electron, no launch token). It cannot prove the caller is
 * MasarFlow, but it blocks the two browser-borne attacks: DNS rebinding (Host allow-list) and
 * cross-site requests (Origin + Fetch Metadata). A local process can forge headers; that attacker
 * already runs code as the user and is out of scope (SECURITY.md).
 */
export function checkDevRequest(cfg: { port: string }, r: DevGuardRequest): GuardResult {
  const hosts = [`localhost:${cfg.port}`, `127.0.0.1:${cfg.port}`];
  const host = r.host?.toLowerCase() ?? "";
  if (!hosts.includes(host)) return deny(403, "host not allowed");
  if (!r.pathname.startsWith("/api/")) return { ok: true };
  if (r.fetchSite?.toLowerCase() === "cross-site") return deny(403, "cross-site request");
  const origins = hosts.map((h) => `http://${h}`);
  if (r.origin !== null) {
    if (!origins.includes(r.origin)) return deny(403, "origin not allowed");
  } else if (!READ_ONLY.has(r.method.toUpperCase())) {
    return deny(403, "state-changing requests must carry an allowed origin");
  }
  return { ok: true };
}
