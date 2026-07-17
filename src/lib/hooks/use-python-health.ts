"use client";

import { useCallback, useEffect, useState } from "react";

export type PythonHealthState = "checking" | "ok" | "down";

export interface PythonHealth {
  state: PythonHealthState;
  ollamaAvailable: boolean;
  recheck: () => void;
}

/**
 * Tracks the local Python AI service's reachability via /api/python/health.
 * While down, polls every few seconds so a hard boot gate clears the moment
 * the user starts the service — no manual refresh needed.
 */
export function usePythonHealth(pollMs = 3000): PythonHealth {
  const [state, setState] = useState<PythonHealthState>("checking");
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [nonce, setNonce] = useState(0);

  const recheck = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      try {
        const res = await fetch("/api/python/health", {
          signal: AbortSignal.timeout(2000),
        });
        const data = (await res.json()) as { ok?: boolean; ollama?: { available?: boolean } };
        if (cancelled) return;
        if (data.ok === true) {
          setState("ok");
          setOllamaAvailable(data.ollama?.available === true);
          return;
        }
        setState("down");
        setOllamaAvailable(false);
        timer = setTimeout(check, pollMs);
      } catch {
        if (cancelled) return;
        setState("down");
        setOllamaAvailable(false);
        timer = setTimeout(check, pollMs);
      }
    };
    void check();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nonce, pollMs]);

  return { state, ollamaAvailable, recheck };
}
