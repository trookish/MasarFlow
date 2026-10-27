"use client";

/**
 * Terminal panel: a real shell in a dock panel.
 *
 * The panel is a normal dock page — it can be tabbed, split, floated and is
 * restored after a reload (sessions are re-attached from the main process's
 * ring buffer). The main process decides whether the folder may be used; this
 * component states that decision in words before anything runs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal as Xterm, type ITerminalOptions } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Ban, CircleCheck, Play, RefreshCw, SquareTerminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDesktop } from "@/lib/desktop/bridge";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { linkedProjectsRepo } from "@/lib/db/repos";
import type { LinkedProject } from "@/lib/db/schema";
import {
  exitNote,
  rootStateText,
  sessionLabel,
  terminalWarning,
  type TerminalSessionView,
} from "@/lib/tools/terminal";
import { cn } from "@/lib/utils/cn";

export function TerminalPanel() {
  const desktop = useMemo(() => getDesktop(), []);
  const projectId = useActiveProjectId();
  const [roots, setRoots] = useState<LinkedProject[]>([]);
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<TerminalSessionView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!desktop || !projectId) return;
    const list = await linkedProjectsRepo.listByProject(projectId);
    setRoots(list);
    const entries = await Promise.all(
      list.map(async (root) => [root.rootPath, await desktop.roots.covers(root.rootPath)] as const),
    );
    setAllowed(Object.fromEntries(entries));
    const live = await desktop.terminal.list();
    setSessions(live.map((s) => ({ id: s.id, label: s.label, cwd: s.cwd, status: s.status, exitCode: s.exitCode })));
    setActiveId((current) => current ?? live[0]?.id ?? null);
  }, [desktop, projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial session + roots load
    void refresh();
  }, [refresh]);

  // Session list follows the main process.
  useEffect(() => {
    if (!desktop) return;
    const offExit = desktop.terminal.onExit(({ id, exitCode }) => {
      setSessions((list) =>
        list.map((s) => (s.id === id ? { ...s, status: "exited", exitCode } : s)),
      );
      setActiveId((current) => current ?? id);
    });
    return () => offExit();
  }, [desktop]);

  async function start(root: LinkedProject): Promise<void> {
    if (!desktop) return;
    setBusy(true);
    setError(null);
    try {
      const res = await desktop.terminal.start({ cwd: root.rootPath });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const session = res.session;
      setSessions((list) => [
        ...list,
        { id: session.id, label: session.label, cwd: session.cwd, status: session.status, exitCode: session.exitCode },
      ]);
      setActiveId(session.id);
    } finally {
      setBusy(false);
    }
  }

  async function closeSession(id: string): Promise<void> {
    await desktop?.terminal.kill(id);
    setSessions((list) => list.filter((s) => s.id !== id));
    setActiveId((current) => (current === id ? null : current));
  }

  if (!desktop) {
    return (
      <EmptyState
        icon={SquareTerminal}
        title="The terminal runs in the desktop app"
        description="Open MasarFlow as the desktop app to run commands. The browser build cannot start a shell on this machine."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Session bar */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setActiveId(session.id)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
                session.id === activeId
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {sessionLabel(session.label, session.cwd)}
              {session.status === "exited" ? (
                <span className="text-xs text-muted-foreground">(exited)</span>
              ) : null}
            </button>
          ))}
          {sessions.length === 0 ? (
            <span className="text-xs text-muted-foreground">No session yet.</span>
          ) : null}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Refresh sessions" onClick={() => void refresh()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Run-in picker: shows the allow-list decision before anything runs. */}
      <div className="shrink-0 space-y-1 border-b border-border px-3 py-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Start a session in
        </p>
        {roots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No folder is linked to this project yet. Link one in{" "}
            <span className="font-medium">Chat → Linked folders</span>, then refresh.
          </p>
        ) : (
          <ul className="space-y-1">
            {roots.map((root) => (
              <li key={root.id} className="flex items-center gap-2 text-xs">
                {allowed[root.rootPath] ? (
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono">{root.rootPath}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !allowed[root.rootPath]}
                  onClick={() => void start(root)}
                >
                  <Play className="h-3 w-3" /> Start
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {rootStateText(rootStateVisible(allowed), true)}
        </p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {/* Terminal surface */}
      <div className="min-h-0 flex-1">
        {activeId ? (
          <TerminalView
            key={activeId}
            sessionId={activeId}
            cwd={sessions.find((s) => s.id === activeId)?.cwd ?? ""}
            onClose={() => void closeSession(activeId)}
          />
        ) : (
          <EmptyState
            icon={SquareTerminal}
            title="Nothing running"
            description="Pick a folder above and press Start. Commands run on this computer, inside that folder."
          />
        )}
      </div>
    </div>
  );
}

/** True when at least one linked root is currently registered. */
function rootStateVisible(allowed: Record<string, boolean>): boolean {
  return Object.values(allowed).some(Boolean);
}

function TerminalView({
  sessionId,
  cwd,
  onClose,
}: {
  sessionId: string;
  cwd: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const desktop = getDesktop();
    const container = containerRef.current;
    if (!desktop || !container) return;

    const options: ITerminalOptions = {
      fontFamily: "Geist Mono, ui-monospace, monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10_000,
      allowTransparency: true,
      convertEol: false,
      theme: {
        background: "transparent",
        foreground: "#e4e4e7",
        cursor: "#a1a1aa",
        selectionBackground: "#3f3f46",
      },
    };
    const term = new Xterm(options);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    let mounted = true;
    const write = (data: string): void => {
      if (mounted) term.write(data);
    };

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "c" || e.key === "C") && term.hasSelection()) {
        const text = term.getSelection();
        term.clearSelection();
        void desktop.clipboard.writeText(text);
        return false;
      }
      return true;
    });

    void desktop.terminal.buffer(sessionId).then((buffer) => {
      if (mounted && buffer) term.write(buffer);
    });

    const offOut = desktop.terminal.onOutput(({ id, data }) => {
      if (id === sessionId) write(data);
    });
    const offExit = desktop.terminal.onExit(({ id, exitCode }) => {
      if (id === sessionId) {
        write(`\r\n\x1b[38;5;242m───────────── ${exitNote(exitCode)} ─────────────\x1b[0m\r\n`);
      }
    });
    const onData = term.onData((data) => {
      if (data === "\x16") {
        void desktop.clipboard.readText().then((text) => {
          if (text && mounted) term.paste(text);
        });
        return;
      }
      desktop.terminal.write(sessionId, data);
    });

    const doFit = (): void => {
      try {
        fit.fit();
        desktop.terminal.resize(sessionId, term.cols, term.rows);
      } catch {
        // container hidden (inactive tab) — the observer retries on next tick
      }
    };
    const observer = new ResizeObserver(() => doFit());
    observer.observe(container);
    requestAnimationFrame(doFit);

    const focus = (): void => term.focus();
    container.addEventListener("click", focus);

    return () => {
      mounted = false;
      offOut();
      offExit();
      onData.dispose();
      observer.disconnect();
      container.removeEventListener("click", focus);
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {terminalWarning(cwd)}
        </p>
        <Button variant="ghost" size="icon-sm" aria-label="End this session" onClick={onClose}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={containerRef}
        aria-label="Terminal output"
        className="h-full w-full overflow-hidden bg-background p-2"
      />
    </div>
  );
}
