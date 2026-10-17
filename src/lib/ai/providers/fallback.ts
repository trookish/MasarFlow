/** One place a turn can be sent: a saved connection + a model id. */
export interface FallbackTarget {
  connectionId: string;
  modelId: string;
}

export type FailureKind = "retryable" | "switch" | "fatal";

/**
 * retryable — transient (rate limit, 5xx, network, timeout): retry once, then move on.
 * switch    — this target can never work right now (bad key, no credit, unknown model): move on now.
 * fatal     — the request itself is wrong or the user cancelled: falling back would only repeat it.
 */
export function classifyFailure(err: unknown): FailureKind {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/abort|cancel/.test(msg)) return "fatal";
  if (/context|too long|maximum.*tokens|token limit/.test(msg)) return "fatal";
  if (/401|unauthorized|invalid api key|incorrect api key|authentication|403|forbidden/.test(msg)) return "switch";
  if (/402|insufficient|balance|credits|payment|out of credit/.test(msg)) return "switch";
  if (/404|not found|no such model|does not exist/.test(msg)) return "switch";
  if (/429|rate limit|too many requests|quota|5\d\d|overloaded|internal|fetch failed|network|econnrefused|enotfound|socket|timeout|timed out|took longer|stopped responding|could not reach/.test(msg)) {
    return "retryable";
  }
  return "fatal";
}

export interface FallbackOptions {
  retryDelayMs?: number;
  onSwitch?: (from: FallbackTarget, to: FallbackTarget, reason: string) => void;
}

/** Try `chain` in order. Resolves with the value and the target that produced it. */
export async function runWithFallback<T>(
  chain: FallbackTarget[],
  attempt: (target: FallbackTarget) => Promise<T>,
  opts: FallbackOptions = {},
): Promise<{ value: T; used: FallbackTarget }> {
  if (chain.length === 0) throw new Error("No model is configured for this chat.");
  const delay = opts.retryDelayMs ?? 1500;
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const target = chain[i];
    for (let tries = 0; tries < 2; tries++) {
      try {
        return { value: await attempt(target), used: target };
      } catch (err) {
        lastErr = err;
        const kind = classifyFailure(err);
        if (kind === "fatal") throw err;
        if (kind === "retryable" && tries === 0) {
          if (delay > 0) await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        break;
      }
    }
    const next = chain[i + 1];
    if (next) opts.onSwitch?.(target, next, lastErr instanceof Error ? lastErr.message : String(lastErr));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
