import {
  CheckCircle2,
  Circle,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "@/lib/store";
import type { StepStatus } from "@shared/types";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "pass":
      return <CheckCircle2 className="h-4 w-4 text-node-lore" />;
    case "fail":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" />;
  }
}

const STATUS_BADGE: Record<StepStatus, { label: string; variant: "success" | "destructive" | "primary" | "default" | "warning" }> = {
  pass: { label: "OK", variant: "success" },
  fail: { label: "Missing", variant: "destructive" },
  missing: { label: "Not installed", variant: "default" },
  running: { label: "Installing…", variant: "primary" },
  pending: { label: "Pending", variant: "warning" },
};

export function SetupPage() {
  const setup = useApp((s) => s.setup);
  const setPage = useApp((s) => s.setPage);
  const [busy, setBusy] = useState(false);

  const check = async (): Promise<void> => {
    setBusy(true);
    try {
      await window.masarFlow.setup.check();
    } finally {
      setBusy(false);
    }
  };

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      await window.masarFlow.setup.run();
    } finally {
      setBusy(false);
    }
  };

  const steps = setup?.steps ?? [];
  const anyFail = steps.some((s) => s.status === "fail");
  const anyMissing = steps.some((s) => s.status === "missing" || s.status === "pending");
  const initialized = setup?.initialized ?? false;

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">Setup</h1>
          <p className="text-sm text-muted-foreground">
            The launcher checks that everything MasarFlow needs is installed, and installs it for you.
          </p>
        </div>

        {initialized ? (
          <div className="flex items-center gap-3 rounded-lg border border-node-lore/40 bg-node-lore/10 px-4 py-3">
            <Sparkles className="h-4 w-4 shrink-0 text-node-lore" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">All requirements satisfied</p>
              <p className="text-xs text-muted-foreground">You're ready to run MasarFlow.</p>
            </div>
            <Button size="sm" onClick={() => setPage("run")}>
              <Play className="h-3.5 w-3.5" />
              Go to Run
            </Button>
          </div>
        ) : anyFail ? (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
            <XCircle className="h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">A required tool is missing</p>
              <p className="text-xs text-muted-foreground">
                Install the missing tools listed below, then re-check. Installation only covers the project itself.
              </p>
            </div>
          </div>
        ) : null}

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                <span className="font-mono text-xs text-muted-foreground">{setup?.targetDir}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={check} disabled={busy}>
                  <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
                  Re-check
                </Button>
                <Button size="sm" onClick={run} disabled={busy || initialized || anyFail}>
                  <Play className="h-3.5 w-3.5" />
                  {anyMissing ? "Run initialization" : "Re-check"}
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {steps.map((step) => (
                <li key={step.key} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                    <StepIcon status={step.status} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{step.label}</span>
                      <Badge variant={STATUS_BADGE[step.status].variant}>
                        {STATUS_BADGE[step.status].label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                    {step.detail && (
                      <p className={cn("mt-1 text-xs", step.status === "fail" ? "text-destructive" : "text-muted-foreground")}>
                        {step.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">What initialization does</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>• Installs Node dependencies (<code className="font-mono">npm install</code>) when node_modules is missing.</li>
            <li>• Copies <code className="font-mono">.env.local.example</code> → <code className="font-mono">.env.local</code> when missing.</li>
            <li>• Creates <code className="font-mono">python-service/.venv</code> and installs the AI requirements (takes a few minutes the first time).</li>
            <li>• Everything streams live to the terminal panel below.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
