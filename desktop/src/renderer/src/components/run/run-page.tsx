import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Hammer,
  Play,
  Rocket,
  Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp, openTerminalWithSession } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/kbd";

type Mode = "dev" | "prod";

function ServiceChips() {
  const server = useApp((s) => s.server);
  const chips = [
    { label: `App :${server.appPort}`, up: server.app },
    { label: `Python AI :${server.pythonPort}`, up: server.python },
  ];
  return (
    <div className="flex items-center gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-xs tabular-nums",
            c.up ? "text-node-lore" : "text-muted-foreground",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", c.up ? "bg-node-lore" : "bg-muted-foreground")} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

function RequirementBanner() {
  const setup = useApp((s) => s.setup);
  const setPage = useApp((s) => s.setPage);
  if (setup?.initialized) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Requirements are not fully set up yet</p>
        <p className="text-xs text-muted-foreground">
          Run the initialization to install dependencies and the Python environment before starting.
        </p>
      </div>
      <Button size="sm" onClick={() => setPage("setup")}>
        Go to setup
      </Button>
    </div>
  );
}

export function RunPage() {
  const [mode, setMode] = useState<Mode>("dev");
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  pendingRef.current = pendingStart;

  const sessions = useApp((s) => s.sessions);
  const server = useApp((s) => s.server);
  const settings = useApp((s) => s.settings);

  const runSessions = sessions.filter((s) => s.kind === "run");
  const lastRun = runSessions[runSessions.length - 1];
  const runActive = runSessions.some((s) => s.status === "running");
  const buildSessions = sessions.filter((s) => s.kind === "build");
  const lastBuild = buildSessions[buildSessions.length - 1];
  const buildActive = buildSessions.some((s) => s.status === "running");

  // Chain "Build & start": when the pending build exits 0, start production.
  useEffect(() => {
    const off = window.masarFlow.session.onExit(({ id, exitCode }) => {
      if (id === pendingRef.current) {
        setPendingStart(null);
        if (exitCode === 0) {
          void window.masarFlow.run.startProd(settings?.autoOpenBrowser ?? false);
        }
      }
    });
    return off;
  }, [settings?.autoOpenBrowser]);

  const startDev = (): void => {
    void window.masarFlow.run.startDev(settings?.autoOpenBrowser ?? true).then((s) => {
      void openTerminalWithSession(s.id);
    });
  };
  const startProd = (): void => {
    void window.masarFlow.run.startProd(settings?.autoOpenBrowser ?? true).then((s) => {
      void openTerminalWithSession(s.id);
    });
  };
  const stopRun = (): void => {
    void window.masarFlow.run.stop();
  };
  const build = (): void => {
    void window.masarFlow.run.build().then((s) => {
      void openTerminalWithSession(s.id);
    });
  };
  const buildAndStart = (): void => {
    void window.masarFlow.run.build().then((s) => setPendingStart(s.id));
  };

  const devState = !lastRun
    ? { label: "Not running", tone: "idle" as const }
    : runActive
      ? server.app
        ? { label: "Ready", tone: "ready" as const }
        : { label: "Starting services…", tone: "starting" as const }
      : { label: `Exited (code ${lastRun.exitCode})`, tone: (lastRun.exitCode === 0 ? "ready" : "error") as "ready" | "error" };

  const prodState = !lastRun
    ? { label: "Not running", tone: "idle" as const }
    : runActive
      ? server.app
        ? { label: "Ready", tone: "ready" as const }
        : { label: "Starting…", tone: "starting" as const }
      : { label: `Exited (code ${lastRun.exitCode})`, tone: (lastRun.exitCode === 0 ? "ready" : "error") as "ready" | "error" };

  const buildState = !lastBuild
    ? null
    : lastBuild.status === "running"
      ? { label: "Building…", tone: "starting" as const }
      : { label: `Build ${lastBuild.exitCode === 0 ? "succeeded" : `failed (code ${lastBuild.exitCode})`}`, tone: (lastBuild.exitCode === 0 ? "ready" : "error") as "ready" | "error" };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Run</h1>
            <p className="text-sm text-muted-foreground">
              Start MasarFlow in development or production — everything streams to the built-in terminal.
            </p>
          </div>
          <ServiceChips />
        </div>

        <RequirementBanner />

        {/* Mode switch (MasarFlow-style pill tabs) */}
        <div className="flex w-fit items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              { m: "dev", label: "Development", sub: "dev:full" },
              { m: "prod", label: "Production", sub: "build + start" },
            ] as Array<{ m: Mode; label: string; sub: string }>
          ).map(({ m, label, sub }) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors duration-150",
                mode === m ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span className="font-mono text-[10px] text-muted-foreground">{sub}</span>
            </button>
          ))}
        </div>

        {mode === "dev" ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Play className="h-4 w-4" />
                  </span>
                  <CardTitle>Development server</CardTitle>
                </div>
                <Badge variant={devState.tone === "ready" ? "success" : devState.tone === "starting" ? "primary" : devState.tone === "error" ? "destructive" : "default"}>
                  {devState.tone === "starting" && <Spinner className="h-3 w-3" />}
                  {devState.label}
                </Badge>
              </div>
              <CardDescription>
                Runs <code className="font-mono text-[11px] text-primary">npm run dev:full</code> — Next.js dev server
                with hot reload, plus the Python AI service and the OpenCode chat backend.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              {runActive ? (
                <Button variant="destructive" onClick={stopRun}>
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              ) : (
                <Button onClick={startDev} disabled={buildActive || pendingStart !== null}>
                  <Play className="h-4 w-4" />
                  Start development
                </Button>
              )}
              <Button
                variant="outline"
                disabled={!server.app}
                onClick={() => void window.masarFlow.shell.openExternal(`http://127.0.0.1:${server.appPort}`)}
              >
                <ExternalLink className="h-4 w-4" />
                Open in browser
              </Button>
              {server.app && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-node-lore">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  App reachable at http://127.0.0.1:{server.appPort}
                </span>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <Hammer className="h-4 w-4" />
                    </span>
                    <CardTitle>Production build</CardTitle>
                  </div>
                  {buildState && (
                    <Badge variant={buildState.tone === "ready" ? "success" : buildState.tone === "starting" ? "primary" : "destructive"}>
                      {buildState.tone === "starting" && <Spinner className="h-3 w-3" />}
                      {buildState.label}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Runs <code className="font-mono text-[11px] text-primary">npm run build</code> — Next.js production build. Required once before starting.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Button onClick={build} disabled={buildActive || runActive} variant="secondary">
                  <Hammer className="h-4 w-4" />
                  Build
                </Button>
                <Button onClick={buildAndStart} disabled={buildActive || runActive}>
                  <Rocket className="h-4 w-4" />
                  Build & start
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <Rocket className="h-4 w-4" />
                    </span>
                    <CardTitle>Production server</CardTitle>
                  </div>
                  <Badge variant={prodState.tone === "ready" ? "success" : prodState.tone === "starting" ? "primary" : prodState.tone === "error" ? "destructive" : "default"}>
                    {prodState.tone === "starting" && <Spinner className="h-3 w-3" />}
                    {prodState.label}
                  </Badge>
                </div>
                <CardDescription>
                  Runs <code className="font-mono text-[11px] text-primary">npm start</code> — the production launcher
                  (Next.js + Python service + OpenCode server).
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                {runActive ? (
                  <Button variant="destructive" onClick={stopRun}>
                    <Square className="h-4 w-4" />
                    Stop
                  </Button>
                ) : (
                  <Button onClick={startProd} disabled={buildActive || pendingStart !== null}>
                    <Play className="h-4 w-4" />
                    Start production
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={!server.app}
                  onClick={() => void window.masarFlow.shell.openExternal(`http://127.0.0.1:${server.appPort}`)}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in browser
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
