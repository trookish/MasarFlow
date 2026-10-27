"use client";

/**
 * Log panel: pick one of the app's log files and read its tail. Read-only —
 * there is no "clear logs" button on purpose (deleting evidence while
 * debugging is how bugs get lost); use "Open logs folder" to manage them.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDesktop } from "@/lib/desktop/bridge";
import { levelClass, levelFilterLabel, lineLevel, passesFilter, type LogFilter } from "@/lib/tools/logs";
import { cn } from "@/lib/utils/cn";

interface LogFileView {
  name: string;
  bytes: number;
  modifiedAt: number;
}

const FILTERS: LogFilter[] = ["all", "warn", "error"];

export function LogsPanel() {
  const desktop = useMemo(() => getDesktop(), []);
  const [files, setFiles] = useState<LogFileView[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (name?: string) => {
      if (!desktop) return;
      setBusy(true);
      try {
        const list = await desktop.logs.list();
        setFiles(list);
        const target = name ?? active ?? list[0]?.name ?? null;
        setActive(target);
        setLines(target ? await desktop.logs.tail(target, 400) : []);
      } finally {
        setBusy(false);
      }
    },
    [active, desktop],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial tail load
    void load();
    // Refresh every 5 s so a running server's output is visible while it happens.
    // Depends on `load` so the interval always tails the file the user picked.
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  if (!desktop) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Logs are read by the desktop app"
        description="The browser build has no access to the application's log folder. Open the desktop app to read them."
      />
    );
  }

  const visible = lines.filter((line) => passesFilter(line, filter));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-2">
        <select
          aria-label="Log file"
          value={active ?? ""}
          onChange={(e) => void load(e.target.value)}
          className="h-7 max-w-56 rounded-md border border-border bg-background px-2 text-xs"
        >
          {files.length === 0 ? <option value="">No log files yet</option> : null}
          {files.map((file) => (
            <option key={file.name} value={file.name}>
              {file.name} ({Math.max(1, Math.round(file.bytes / 1024))} KB)
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1" role="group" aria-label="Filter log lines">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "h-7 rounded-md px-2 text-xs transition-colors",
                filter === value
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {levelFilterLabel(value)}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length} of {lines.length} lines
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Refresh" disabled={busy} onClick={() => void load()}>
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void desktop.app.openLogs()}
          title="Open the log folder in your file manager"
        >
          <FolderOpen className="h-3.5 w-3.5" /> Open logs folder
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed">
        {lines.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            This file is empty. Start or use the app for a while, then press Refresh.
          </p>
        ) : (
          visible.map((line, index) => (
            <div key={index} className={cn("whitespace-pre-wrap", levelClass(lineLevel(line)))}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
