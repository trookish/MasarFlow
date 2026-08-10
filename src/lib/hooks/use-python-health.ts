"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PythonStartupStatus } from "@/lib/python/startup";

export type PythonHealthState = "checking" | "ok" | "down";
export type PythonStartupStepId = "resolve" | "spawn" | "health" | "ready";
export type StepStatus = "pending" | "running" | "done" | "failed";

export interface PythonStartupStep {
  id: PythonStartupStepId;
  label: string;
  status: StepStatus;
}

export interface PythonHealth {
  state: PythonHealthState;
  ollamaAvailable: boolean;
  /** Human-readable failure reason from the last failed check (null when ok). */
  error: string | null;
  /** The service base URL the app is probing (from the server). */
  serviceUrl: string | null;
  /** Number of consecutive failed health checks since the last success. */
  attempts: number;
  recheck: () => void;
  /** Real per-step startup progress — a step completes only when its
   *  underlying operation actually succeeded. */
  steps: PythonStartupStep[];
  /** Process exit code when the Python service died on its own. */
  exitCode: number | null;
  /** Last lines of the Python process output, for diagnostics. */
  stdoutTail: string[];
  stderrTail: string[];
}

const STEP_LABELS: { id: PythonStartupStepId; label: string }[] = [
  { id: "resolve", label: "Resolving the local AI service address" },
  { id: "spawn", label: "Starting the Python service" },
  { id: "health", label: "Waiting for the service health check" },
  { id: "ready", label: "Confirming embeddings and search are ready" },
];

const HEALTH_TIMEOUT_MS = 1500;
const HEALTH_POLL_MS = 1000;
const HEALTH_DEADLINE_MS = 60_000;
const READY_TIMEOUT_MS = 20_000;
const READY_RETRY_MS = 1000;
const READY_DEADLINE_MS = 120_000;
const RECOVERY_POLL_MS = 2000;
const STATUS_POLL_MS = 300;
const SPAWN_WAIT_DEADLINE_MS = 15_000;
const MAX_TAIL = 15;

/**
 * Drives the local Python AI service's real startup flow:
 *
 *   resolve address → spawn uvicorn → wait for /health → readiness probe
 *
 * Steps are only marked done once their operation succeeded; any process
 * failure (exit code, crash, spawn error) stops the flow immediately with the
 * actual CLI/process error. While the process is alive, health checks keep
 * retrying — ECONNREFUSED/timeouts are expected mid-start, not fatal — but
 * each phase has a hard deadline, so a wedged process always ends on the
 * error page instead of spinning forever. Retry (recheck) cleanly restarts
 * the whole flow via the server's restart action.
 */
export function usePythonHealth(): PythonHealth {
  const [state, setState] = useState<PythonHealthState>("checking");
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceUrl, setServiceUrl] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [steps, setSteps] = useState<PythonStartupStep[]>(() =>
    STEP_LABELS.map((s) => ({ ...s, status: "pending" as StepStatus })),
  );
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [stdoutTail, setStdoutTail] = useState<string[]>([]);
  const [stderrTail, setStderrTail] = useState<string[]>([]);
  const [nonce, setNonce] = useState(0);
  const restartRef = useRef(false);

  const recheck = useCallback(() => {
    restartRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let flowFailed = false;

    const delay = (ms: number) =>
      new Promise<void>((resolvePromise) => {
        timer = setTimeout(resolvePromise, ms);
      });

    const setStep = (id: PythonStartupStepId, status: StepStatus) => {
      if (cancelled) return;
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    };

    const resetSteps = () => {
      setSteps(
        STEP_LABELS.map((s) => ({ ...s, status: "pending" as StepStatus })),
      );
    };

    const fail = (reason: string, status?: PythonStartupStatus) => {
      if (cancelled || flowFailed) return;
      flowFailed = true;
      setError(reason);
      setExitCode(status?.exitCode ?? null);
      setStderrTail((status?.stderrTail ?? []).slice(-MAX_TAIL));
      setStdoutTail((status?.stdoutTail ?? []).slice(-MAX_TAIL));
      if (status?.serviceUrl) setServiceUrl(status.serviceUrl);
      setState("down");
    };

    const applyStatusFailure = (status: PythonStartupStatus) => {
      fail(status.error ?? "The Python service is not running.", status);
    };

    async function fetchStatus(): Promise<PythonStartupStatus | null> {
      try {
        const res = await fetch("/api/python/startup", {
          signal: AbortSignal.timeout(3000),
        });
        return (await res.json()) as PythonStartupStatus;
      } catch {
        return null;
      }
    }

    async function fetchHealth(): Promise<{
      ok: boolean;
      ollama: boolean;
      serviceUrl: string | null;
    }> {
      try {
        const res = await fetch("/api/python/health", {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          ollama?: { available?: boolean };
          serviceUrl?: string;
        };
        return {
          ok: data.ok === true,
          ollama: data.ollama?.available === true,
          serviceUrl: data.serviceUrl ?? null,
        };
      } catch {
        return { ok: false, ollama: false, serviceUrl: null };
      }
    }

    /** Returns true when ready; false when the process died meanwhile, the
     *  readiness deadline passed, or the flow was cancelled (failure has been
     *  applied). Bounded so a stuck model load never spins forever. */
    async function waitForReady(): Promise<boolean> {
      const waitStart = Date.now();
      let lastError: string | null = null;
      while (!cancelled) {
        let ready = false;
        let routeError: string | null = null;
        try {
          const res = await fetch("/api/python/ready", {
            signal: AbortSignal.timeout(READY_TIMEOUT_MS),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            ready?: boolean;
            error?: string;
          };
          ready = data.ok === true && data.ready === true;
          if (!ready) routeError = data.error ?? null;
        } catch {
          ready = false;
        }
        if (ready) return true;
        if (cancelled) return false;
        if (routeError) lastError = routeError;
        const status = await fetchStatus();
        if (status?.state === "failed") {
          applyStatusFailure(status);
          return false;
        }
        if (Date.now() - waitStart > READY_DEADLINE_MS) {
          fail(
            lastError ??
              "The Python service did not confirm embeddings and search are ready.",
            status ?? undefined,
          );
          return false;
        }
        await delay(READY_RETRY_MS);
      }
      return false;
    }

    /** Full startup: resolve → spawn → health → ready. */
    const run = async (restart: boolean) => {
      if (cancelled) return;
      resetSteps();
      setState("checking");
      setError(null);
      setExitCode(null);
      setStderrTail([]);
      setStdoutTail([]);
      setAttempts(0);
      setOllamaAvailable(false);
      flowFailed = false;

      setStep("resolve", "running");
      let status: PythonStartupStatus | null = null;
      try {
        const res = await fetch(
          `/api/python/startup${restart ? "?action=restart" : ""}`,
          { method: "POST", signal: AbortSignal.timeout(15_000) },
        );
        status = (await res.json()) as PythonStartupStatus;
      } catch {
        fail("Could not reach the app server to start the Python service.");
        return;
      }
      if (cancelled) return;
      setStep("resolve", "done");
      if (status.serviceUrl) setServiceUrl(status.serviceUrl);
      if (status.state === "failed") {
        applyStatusFailure(status);
        return;
      }

      // Spawn still in flight on the server — wait until it resolves (bounded,
      // so a wedged server never leaves the screen on "Starting the Python
      // service" forever).
      const spawnWaitStart = Date.now();
      while (status?.state === "starting" && !cancelled) {
        await delay(STATUS_POLL_MS);
        status = await fetchStatus();
        if (status?.state === "failed") {
          applyStatusFailure(status);
          return;
        }
        if (Date.now() - spawnWaitStart > SPAWN_WAIT_DEADLINE_MS) {
          fail(
            "Timed out waiting for the Python service to start.",
            status ?? undefined,
          );
          return;
        }
      }
      if (cancelled) return;
      setStep("spawn", "done");

      // Wait for /health. ECONNREFUSED and timeouts are expected while uvicorn
      // boots — keep retrying; only a dead process (or a startup deadline)
      // stops the flow.
      setStep("health", "running");
      let healthy = false;
      const startedAt = status?.startedAt ?? null;
      let lastStatus: PythonStartupStatus | null = status;
      while (!healthy && !cancelled) {
        const h = await fetchHealth();
        if (h.ok) {
          healthy = true;
          setOllamaAvailable(h.ollama);
          setAttempts(0);
          if (h.serviceUrl) setServiceUrl(h.serviceUrl);
          break;
        }
        if (h.serviceUrl) setServiceUrl(h.serviceUrl);
        setAttempts((n) => n + 1);
        const st = await fetchStatus();
        if (st?.state === "failed") {
          applyStatusFailure(st);
          return;
        }
        if (st) lastStatus = st;
        if (startedAt && Date.now() - startedAt > HEALTH_DEADLINE_MS) {
          fail(
            "The Python service is running but did not answer the health check.",
            lastStatus ?? undefined,
          );
          return;
        }
        await delay(HEALTH_POLL_MS);
      }
      if (cancelled) return;
      setStep("health", "done");

      setStep("ready", "running");
      await waitForReady();
      if (cancelled || flowFailed) return;
      setStep("ready", "done");
      setState("ok");
    };

    /** Down-state recovery: poll health; if the service comes up (e.g. the
     *  user started it manually), verify readiness, then clear the gate. */
    const recover = async () => {
      while (!cancelled) {
        const h = await fetchHealth();
        if (h.ok) {
          if (h.serviceUrl) setServiceUrl(h.serviceUrl);
          setOllamaAvailable(h.ollama);
          setStep("health", "done");
          setStep("ready", "running");
          await waitForReady();
          if (cancelled) return;
          setStep("ready", "done");
          setState("ok");
          return;
        }
        setAttempts((n) => n + 1);
        await delay(RECOVERY_POLL_MS);
      }
    };

    const main = async () => {
      const restart = restartRef.current;
      restartRef.current = false;
      await run(restart);
      if (cancelled || !flowFailed) return;
      await recover();
    };

    void main();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nonce]);

  return {
    state,
    ollamaAvailable,
    error,
    serviceUrl,
    attempts,
    recheck,
    steps,
    exitCode,
    stdoutTail,
    stderrTail,
  };
}
