/**
 * Secret redaction for anything the UI might display about the environment.
 *
 * The system panel answers "what am I running" — it must never echo a token
 * or a key. Values for secret-looking keys are replaced with "[REDACTED]"
 * BEFORE they leave the main process, so a secret never reaches the renderer
 * (or a diagnostics copy) in the first place. The pure helpers are shared by
 * main and renderer and are unit-tested.
 */

export interface EnvRow {
  key: string;
  value: string;
  /** True when the value was masked (key matched the secret pattern). */
  redacted: boolean;
}

export const REDACTED = "[REDACTED]";

/** Anything that smells like a credential: token, key, secret, password. */
export const SECRET_KEY_PATTERN = /key|token|secret|password/i;

/** True when the environment variable's value must never be shown. */
export function isSecretKey(key: string): boolean {
  return key === "MASARFLOW_TOKEN" || SECRET_KEY_PATTERN.test(key);
}

/** Rows for a set of environment entries, secret values masked, sorted by key. */
export function redactEnv(env: Record<string, string | undefined>): EnvRow[] {
  const rows: EnvRow[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    rows.push(
      isSecretKey(key)
        ? { key, value: REDACTED, redacted: true }
        : { key, value, redacted: false },
    );
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * The environment the system panel may show: only MasarFlow's own variables
 * (whitelist), with secret-looking keys already redacted. The process's full
 * environment is never exposed.
 */
export function envForDisplay(
  env: Record<string, string | undefined>,
  prefix = "MASARFLOW_",
): EnvRow[] {
  const picked: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(prefix)) picked[key] = value;
  }
  return redactEnv(picked);
}
