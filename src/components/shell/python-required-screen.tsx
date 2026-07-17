"use client";

import { ServerCog, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePythonHealth } from "@/lib/hooks/use-python-health";

/**
 * Hard boot gate. Shown in place of the workspace shell when the local Python
 * AI service isn't reachable. Python is a required runtime dependency: search,
 * RAG-grounded chat context, and the Phase 2 intelligence features all depend
 * on it. Auto-polls so the gate clears as soon as the service starts.
 */
export function PythonRequiredScreen() {
  const { state, recheck } = usePythonHealth();

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-card-foreground">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
          <ServerCog className="h-6 w-6" />
        </div>
        <h1 className="text-base font-semibold tracking-tight">
          {state === "checking" ? "Starting local AI service…" : "Python service required"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          MasarFlow needs the local Python AI service running for semantic
          search, RAG-grounded chat, code analysis, and graph intelligence.
          Start it, then this screen clears automatically.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
{`# from the repo root
npm run dev:full        # dev: Next.js + uvicorn
# or, after 'npm run build':
npm start               # prod: Next.js + uvicorn`}
        </pre>
        <div className="mt-5 flex items-center gap-2">
          <Button size="sm" onClick={recheck} disabled={state === "checking"}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
          <span className="text-xs text-muted-foreground">
            {state === "checking" && "Checking…"}
            {state === "down" && "Service unreachable"}
          </span>
        </div>
      </div>
    </div>
  );
}
