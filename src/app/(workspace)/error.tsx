"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MasarFlowLogo } from "@/components/common/masarflow-logo";

export default function WorkspaceErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Workspace error boundary caught:", error);
  }, [error]);

  return (
    <div className="bg-background flex h-full min-h-[50vh] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="relative mb-6">
        <div className="bg-primary/20 absolute inset-0 rounded-2xl blur-xl" />
        <div className="border-border bg-surface/30 relative grid h-16 w-16 place-items-center rounded-2xl border">
          <AlertTriangle className="text-foreground h-8 w-8" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <MasarFlowLogo size="sm" />
        <h1 className="text-xl font-semibold tracking-tight">Workspace error</h1>
      </div>
      <p className="text-muted-foreground mt-3 max-w-md text-sm">
        {error.message || "An unexpected error occurred in the workspace."}
      </p>
      {error.digest && (
        <p className="text-muted-foreground mt-2 font-mono text-[10px]">ID: {error.digest}</p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={reset} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
