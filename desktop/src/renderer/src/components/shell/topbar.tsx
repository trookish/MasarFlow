import { ExternalLink, Monitor, Moon, RefreshCw, SquareTerminal, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_MODES, applyAppearance } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/cn";
import { TitlebarControls } from "./titlebar-controls";
import { UpdateDialog } from "./update-dialog";

function StatusChip() {
  const setup = useApp((s) => s.setup);
  const sessions = useApp((s) => s.sessions);
  const server = useApp((s) => s.server);
  const runActive = sessions.some((s) => s.kind === "run" && s.status === "running");
  const buildActive = sessions.some((s) => s.kind === "build" && s.status === "running");
  const testActive = sessions.some((s) => s.kind === "test" && s.status === "running");

  let label = "Idle";
  let cls = "bg-muted text-muted-foreground";
  if (server.app) {
    label = "Ready — app on";
    cls = "bg-node-lore/15 text-node-lore";
  } else if (runActive) {
    label = "Starting services…";
    cls = "bg-primary/15 text-primary";
  } else if (buildActive || testActive) {
    label = "Working…";
    cls = "bg-warning/15 text-warning";
  } else if (!setup?.initialized) {
    label = "Not initialized";
    cls = "bg-warning/15 text-warning";
  }

  const pulse = server.app || runActive || buildActive || testActive;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", pulse && "animate-pulse")} />
      {label}
    </span>
  );
}

export function Topbar() {
  const terminalOpen = useApp((s) => s.terminalOpen);
  const setTerminalOpen = useApp((s) => s.setTerminalOpen);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const server = useApp((s) => s.server);
  const updateInfo = useApp((s) => s.updateInfo);
  const setUpdateInfo = useApp((s) => s.setUpdateInfo);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (settings) applyAppearance(settings);
  }, [settings]);

  const openUpdates = async (): Promise<void> => {
    setUpdateOpen(true);
    if (!updateInfo && !checking) {
      setChecking(true);
      try {
        setUpdateInfo(await window.masarFlow.updates.check());
      } finally {
        setChecking(false);
      }
    }
  };

  const cycleTheme = () => {
    if (!settings) return;
    const modes = THEME_MODES.map((m) => m.mode);
    const idx = modes.indexOf(settings.theme);
    const next = modes[(idx + 1) % modes.length];
    const patch = { ...settings, theme: next };
    setSettings(patch);
    void window.masarFlow.settings.set({ theme: next });
  };

  return (
    <header className="app-drag relative z-40 flex h-14 shrink-0 items-center border-b border-border bg-background/80 px-3 backdrop-blur">
      <div className="app-no-drag flex items-center">
        <span className="text-sm font-semibold">MasarFlow Launcher</span>
      </div>

      <div className="ml-4 flex items-center gap-2">
        <StatusChip />
      </div>

      {server.app && (
        <button
          onClick={() => void window.masarFlow.shell.openExternal(`http://127.0.0.1:${server.appPort}`)}
          className="app-no-drag ml-2 flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Open app
          <ExternalLink className="h-3 w-3" />
        </button>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => void openUpdates()}
          title="Check for updates"
          className="app-no-drag relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} />
          {updateInfo?.updateAvailable ? (
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
          ) : null}
        </button>
        <button
          onClick={cycleTheme}
          title={`Theme: ${settings?.theme ?? "dark"}`}
          className="app-no-drag flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          {settings?.theme === "light" ? (
            <Sun className="h-4 w-4" />
          ) : settings?.theme === "system" ? (
            <Monitor className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => setTerminalOpen(!terminalOpen)}
          title="Toggle terminal"
          className={cn(
            "app-no-drag flex h-9 w-9 items-center justify-center rounded-md transition-colors",
            terminalOpen
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <SquareTerminal className="h-4 w-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        <TitlebarControls />
      </div>
      {updateOpen && <UpdateDialog onClose={() => setUpdateOpen(false)} />}
    </header>
  );
}
