import { FlaskConical, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SessionInfo, TestDefinition, TestRunResult } from "@shared/types";
import { formatDuration } from "@/lib/cn";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/kbd";

const npm = (script: string): { file: string; args: string[] } =>
  window.masarFlow.platform === "win32"
    ? { file: "cmd.exe", args: ["/c", script] }
    : { file: "/bin/sh", args: ["-lc", script] };

function makeTests(targetDir: string): TestDefinition[] {
  const venvPython =
    window.masarFlow.platform === "win32"
      ? `${targetDir}\\python-service\\.venv\\Scripts\\python.exe`
      : `${targetDir}/python-service/.venv/bin/python`;
  return [
    {
      key: "lint",
      name: "Lint",
      description: "ESLint (Next.js + TypeScript rules)",
      command: "npm run lint",
    },
    {
      key: "typecheck",
      name: "Typecheck",
      description: "TypeScript strict check (tsc --noEmit)",
      command: "npm run typecheck",
    },
    {
      key: "unit",
      name: "Unit tests",
      description: "Vitest unit tests (tests/unit/)",
      command: "npm test",
    },
    {
      key: "e2e",
      name: "E2E",
      description: "Playwright end-to-end smoke tests",
      command: "npm run e2e",
      hint: "Requires a production build first (Run → Production → Build).",
    },
    {
      key: "pytest",
      name: "Python service",
      description: "FastAPI sidecar tests (pytest)",
      command: ".venv python -m pytest",
      hint: "Needs the Python environment from Setup.",
      run: {
        file: venvPython,
        args: ["-m", "pytest"],
        cwd: `${targetDir}/python-service`,
      },
    },
  ];
}

export function TestingPage() {
  const targetDir = useApp((s) => s.settings?.targetDir ?? "");
  const tests = makeTests(targetDir);
  const results = useApp((s) => s.testResults);
  const setTestResult = useApp((s) => s.setTestResult);
  const [running, setRunning] = useState<Record<string, string>>({});
  const startedAt = useRef<Record<string, number>>({});
  const runningRef = useRef<Record<string, string>>({});
  runningRef.current = running;

  useEffect(() => {
    const off = window.masarFlow.session.onExit(({ id, exitCode }) => {
      const entry = Object.entries(runningRef.current).find(([, sid]) => sid === id);
      if (!entry) return;
      const [key] = entry;
      const durationMs = Date.now() - (startedAt.current[key] ?? Date.now());
      setRunning((r) => {
        const next = { ...r };
        delete next[key];
        return next;
      });
      const result: TestRunResult = { key, sessionId: id, ok: exitCode === 0, exitCode, durationMs };
      setTestResult(result);
    });
    return off;
  }, [setTestResult]);

  const runTest = async (t: TestDefinition): Promise<void> => {
    const cwd = t.run?.cwd ?? targetDir;
    const file = t.run?.file ?? npm(t.command).file;
    const args = t.run?.args ?? npm(t.command).args;
    const s: SessionInfo = await window.masarFlow.session.start({
      label: t.command,
      kind: "test",
      command: t.command,
      file,
      args,
      cwd,
    });
    startedAt.current[t.key] = Date.now();
    setRunning((r) => ({ ...r, [t.key]: s.id }));
    const st = useApp.getState();
    st.setTerminalOpen(true);
    st.activateSession(s.id);
  };

  const stopTest = (key: string): void => {
    const sid = running[key];
    if (sid) window.masarFlow.session.kill(sid);
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">Testing</h1>
          <p className="text-sm text-muted-foreground">
            Run MasarFlow's quality gates — output streams to the terminal panel.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {tests.map((t) => {
            const res = results[t.key];
            const isRunning = Boolean(running[t.key]);
            return (
              <Card key={t.key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <FlaskConical className="h-4 w-4" />
                      </span>
                      <CardTitle>{t.name}</CardTitle>
                    </div>
                    {isRunning ? (
                      <Badge variant="primary">
                        <Spinner className="h-3 w-3" />
                        Running
                      </Badge>
                    ) : res ? (
                      <Badge variant={res.ok ? "success" : "destructive"}>
                        {res.ok ? "Passed" : `Failed (code ${res.exitCode})`} · {formatDuration(res.durationMs)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not run</Badge>
                    )}
                  </div>
                  <CardDescription>{t.description}</CardDescription>
                  {t.hint && <CardDescription className="text-node-idea/90">Hint: {t.hint}</CardDescription>}
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <code
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-xs text-muted-foreground",
                    )}
                  >
                    {t.command}
                  </code>
                  {isRunning ? (
                    <Button size="sm" variant="destructive" onClick={() => stopTest(t.key)}>
                      <Square className="h-3.5 w-3.5" />
                      Stop
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void runTest(t)}>
                      <Play className="h-3.5 w-3.5" />
                      Run
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
