import { FlaskConical, Hammer, Play, Plus, SquareTerminal, Wrench, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "@/lib/store";
import type { SessionInfo, SessionKind } from "@shared/types";
import { cn } from "@/lib/cn";
import { TerminalView } from "./terminal-view";

const KIND_ICONS: Record<SessionKind, LucideIcon> = {
  run: Play,
  build: Hammer,
  test: FlaskConical,
  setup: Wrench,
  shell: SquareTerminal,
};

export async function openShell(): Promise<void> {
  const s = await window.masarFlow.session.start({
    label: "Shell",
    kind: "shell",
    command: "cmd",
    file: "cmd.exe",
    args: [],
    cwd: useApp.getState().settings?.targetDir ?? "",
  });
  useApp.getState().setTerminalOpen(true);
  useApp.getState().activateSession(s.id);
}

export function TerminalPanel() {
  const open = useApp((s) => s.terminalOpen);
  const setOpen = useApp((s) => s.setTerminalOpen);
  const sessions = useApp((s) => s.sessions);
  const activeId = useApp((s) => s.activeSessionId);
  const activate = useApp((s) => s.activateSession);
  const removeSession = useApp((s) => s.removeSession);

  const active: SessionInfo | undefined = sessions.find((s) => s.id === activeId) ?? sessions[0];

  const handleNew = (): void => {
    void openShell();
  };

  const closeTab = (id: string): void => {
    window.masarFlow.session.kill(id);
    removeSession(id);
  };

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-t border-border bg-background/80 backdrop-blur transition-all duration-200 ease-in-out",
        open ? "h-60" : "h-0 border-t-0",
      )}
    >
      {/* Tab bar */}
      <div className="flex h-9 shrink-0 items-center border-b border-border px-2">
        <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {sessions.map((s) => {
            const Icon = KIND_ICONS[s.kind];
            return (
              <button
                key={s.id}
                onClick={() => activate(s.id)}
                title={s.command}
                className={cn(
                  "group flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
                  s.id === active?.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="max-w-[140px] truncate">{s.label}</span>
                {s.status === "exited" && (
                  <span className={cn("text-[10px] tabular-nums", s.exitCode === 0 ? "text-node-lore" : "text-destructive")}>
                    {s.exitCode === 0 ? "✓" : `✗ ${s.exitCode}`}
                  </span>
                )}
                {s.status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-node-lore" />}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(s.id);
                  }}
                  className="hidden rounded p-0.5 hover:bg-muted group-hover:block"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            );
          })}
          {sessions.length === 0 && (
            <span className="px-2 text-xs text-muted-foreground">No sessions — start something from the Run or Testing page.</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 pl-2">
          <button
            onClick={handleNew}
            title="New shell (cmd)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            title="Hide terminal"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div className="relative min-h-0 flex-1">
        {active ? (
          <TerminalView key={active.id} sessionId={active.id} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-muted-foreground">
              Start a session — output appears here.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
