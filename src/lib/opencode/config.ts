/**
 * OpenCode integration configuration, read from the environment at call time
 * (so tests can stub env vars without module-level caching). Every value has
 * a safe default — the app degrades to clear "OpenCode unavailable" errors
 * instead of crashing when a variable is missing.
 */

export interface OpenCodeConfig {
  /** Base URL of the OpenCode server (e.g. http://127.0.0.1:4096). */
  baseUrl: string;
  /** HTTP basic-auth credentials for the server (empty = unsecured loopback). */
  username: string;
  password: string;
  /** Default working directory for sessions (fs/shell/file tools operate here). */
  workspaceDir: string;
  /** Per-session tool permission rules (ask → approvals in the chat UI). */
  permissions: {
    edit: "ask" | "allow" | "deny";
    bash: "ask" | "allow" | "deny";
    webfetch: "ask" | "allow" | "deny";
  };
  /** Turn watchdogs. */
  firstEventMs: number;
  idleMs: number;
  totalMs: number;
  /** Provider/model catalog cache TTL. */
  modelCacheTtlMs: number;
}

const DEFAULT_PORT = 4096;
const FIRST_EVENT_MS = 30_000;
const IDLE_MS = 60_000;
const TOTAL_MS = 300_000;
const MODEL_CACHE_TTL_MS = 60_000;

function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function envPermission(
  name: string,
  fallback: "ask" | "allow" | "deny",
): "ask" | "allow" | "deny" {
  const v = process.env[name];
  return v === "allow" || v === "deny" || v === "ask" ? v : fallback;
}

export function opencodeConfig(): OpenCodeConfig {
  const baseUrl = (
    process.env.OPENCODE_BASE_URL ?? `http://127.0.0.1:${DEFAULT_PORT}`
  )
    .trim()
    .replace(/\/+$/, "");
  return {
    baseUrl,
    username: process.env.OPENCODE_USERNAME ?? "opencode",
    password: process.env.OPENCODE_PASSWORD ?? "",
    workspaceDir: process.env.OPENCODE_WORKSPACE_DIR?.trim() || process.cwd(),
    permissions: {
      edit: envPermission("OPENCODE_PERMISSION_EDIT", "ask"),
      bash: envPermission("OPENCODE_PERMISSION_BASH", "ask"),
      webfetch: envPermission("OPENCODE_PERMISSION_WEBFETCH", "ask"),
    },
    firstEventMs: envNumber(
      "MASARFLOW_OPENCODE_FIRST_EVENT_TIMEOUT_MS",
      FIRST_EVENT_MS,
    ),
    idleMs: envNumber("MASARFLOW_OPENCODE_IDLE_TIMEOUT_MS", IDLE_MS),
    totalMs: envNumber("MASARFLOW_OPENCODE_TOTAL_TIMEOUT_MS", TOTAL_MS),
    modelCacheTtlMs: envNumber(
      "OPENCODE_MODEL_CACHE_TTL_MS",
      MODEL_CACHE_TTL_MS,
    ),
  };
}

/** The permission ruleset passed when creating chat sessions. */
export function permissionRules(config: OpenCodeConfig) {
  const rules: {
    permission: string;
    pattern: string;
    action: "ask" | "allow" | "deny";
  }[] = [];
  for (const [permission, action] of Object.entries(config.permissions)) {
    rules.push({ permission, pattern: "*", action });
  }
  return rules;
}
