"use client";

import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  ServerCog,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePythonHealth } from "@/lib/hooks/use-python-health";
import { cn } from "@/lib/utils/cn";

/**
 * Hard boot gate. Shown in place of the workspace shell while the local
 * Python AI service is started for real (spawned from the app, health-checked,
 * readiness-confirmed) or unreachable (the actual CLI/process error + retry).
 * Python is a required runtime: search, RAG-grounded chat context, and the
 * Phase 2 intelligence features all depend on it.
 */

export function PythonRequiredScreen() {
  const {
    state,
    error,
    serviceUrl,
    attempts,
    recheck,
    steps,
    exitCode,
    stderrTail,
    stdoutTail,
  } = usePythonHealth();

  const checking = state === "checking";

  // Live process output while uvicorn boots — real evidence of progress.
  const outputTail = [...stderrTail.slice(-5), ...stdoutTail.slice(-5)];

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-card-foreground">
        {/* Header icon */}
        <div
          className={cn(
            "mb-5 flex h-12 w-12 items-center justify-center rounded-full border",
            checking
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-warning/40 bg-warning/10 text-warning",
          )}
        >
          {checking ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <ServerCog className="h-6 w-6" />
          )}
        </div>

        <h1 className="text-base font-semibold tracking-tight">
          {checking
            ? "Starting local AI service…"
            : "Python service unreachable"}
        </h1>

        {checking ? (
          /* ── Loading: real sequential startup progress ──────────────── */
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">
              MasarFlow needs the local Python AI service for semantic search,
              RAG-grounded chat, code analysis, and graph intelligence.
            </p>
            <div className="mt-4 space-y-2">
              {steps.map((step) => {
                const active = step.status === "running";
                const done = step.status === "done";
                const failed = step.status === "failed";
                return (
                  <div
                    key={step.id}
                    className={cn(
                      "flex items-center gap-2.5 text-xs",
                      active
                        ? "text-foreground"
                        : done
                          ? "text-muted-foreground/60"
                          : failed
                            ? "text-destructive"
                            : "text-muted-foreground/35",
                    )}
                  >
                    {active ? (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    ) : done ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-node-lore/60" />
                    ) : failed ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-border" />
                    )}
                    <span className={cn(active && "font-medium")}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {outputTail.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Terminal className="h-3 w-3" />
                  Process output
                </p>
                <pre className="scrollbar-thin max-h-28 overflow-y-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {outputTail.join("\n")}
                </pre>
              </div>
            )}

            <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              {attempts > 0
                ? `Retrying… (${attempts} failed ${attempts === 1 ? "attempt" : "attempts"})`
                : "Waiting for first response…"}
            </p>
          </div>
        ) : (
          /* ── Failure: the actual error from the process/CLI + retry ─── */
          <div className="mt-3">
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-destructive">
                  {exitCode !== null
                    ? `The Python service exited with code ${exitCode}`
                    : "The Python service did not start"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {error ?? "No response from the health check."}
                </p>
                {serviceUrl && (
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {serviceUrl}/health
                  </p>
                )}
              </div>
            </div>

            {stderrTail.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Terminal className="h-3 w-3" />
                  Error output from the Python process
                </p>
                <pre className="scrollbar-thin max-h-40 overflow-y-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-destructive/90">
                  {stderrTail.join("\n")}
                </pre>
              </div>
            )}

            {error?.startsWith("Python venv not found") && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Set up the Python environment once, then retry:
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                  {`pnpm run setup:python   # creates python-service/.venv + installs deps`}
                </pre>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={recheck}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry now
              </Button>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Terminal className="h-3 w-3" />
                Auto-checking
                {attempts > 0 ? ` — ${attempts} failed so far` : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
