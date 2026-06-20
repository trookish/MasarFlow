"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import {
  Eye,
  Play,
  Pause,
  Plus,
  Trash2,
  FilePlus2,
  FilePen,
  FileX2,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { watchEventsRepo, systemsRepo } from "@/lib/db/repos";
import type { WatchEvent, WatchKind, WatchFileType } from "@/lib/db/schema";
import {
  WATCH_KINDS,
  WATCH_KIND_LABEL,
  WATCH_KIND_STYLE,
  WATCH_FILE_TYPE_LABEL,
  pickChange,
} from "@/lib/watcher";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";

const KIND_ICON: Record<WatchKind, LucideIcon> = {
  created: FilePlus2,
  modified: FilePen,
  deleted: FileX2,
};

const WATCH_INTERVAL_MS = 3500;

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.round(diff / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function WatcherView() {
  const projectId = useActiveProjectId();
  const [watching, setWatching] = useState(false);
  const [kinds, setKinds] = useState<Set<WatchKind>>(() => new Set(WATCH_KINDS));
  const [types, setTypes] = useState<Set<WatchFileType> | null>(null);

  const events = useLiveQuery(
    () => watchEventsRepo.listByProject(projectId),
    [projectId],
  );
  const systems = useLiveQuery(
    () => (projectId ? systemsRepo.listByProject(projectId) : []),
    [projectId],
  );

  const rows = useMemo(() => events ?? [], [events]);
  const systemsById = useMemo(
    () => new Map((systems ?? []).map((s) => [s.id, s.name])),
    [systems],
  );

  // Resolve a system name → id so emitted events can deep-link to Architecture.
  const systemIdByName = useMemo(
    () => new Map((systems ?? []).map((s) => [s.name, s.id])),
    [systems],
  );
  const emit = useCallback(async () => {
    if (!projectId) return;
    const c = pickChange();
    await watchEventsRepo.create({
      projectId,
      path: c.path,
      kind: c.kind,
      fileType: c.fileType,
      systemId: c.systemHint ? (systemIdByName.get(c.systemHint) ?? null) : null,
    });
  }, [projectId, systemIdByName]);

  // Keep the latest emit in a ref so the interval needn't restart on each change.
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);

  // While watching, emit a simulated change on an interval.
  useEffect(() => {
    if (!watching || !projectId) return;
    const handle = setInterval(() => emitRef.current(), WATCH_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [watching, projectId]);

  const presentTypes = useMemo(() => {
    const set = new Set<WatchFileType>();
    for (const r of rows) set.add(r.fileType);
    return [...set];
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) => kinds.has(r.kind) && (!types || types.has(r.fileType)),
      ),
    [rows, kinds, types],
  );

  function toggleKind(k: WatchKind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  function toggleType(t: WatchFileType) {
    setTypes((prev) => {
      const base = prev ?? new Set(presentTypes);
      const next = new Set(base);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next.size === presentTypes.length ? null : next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Project Watcher</span>
        {watching && (
          <span className="flex items-center gap-1.5 text-xs text-node-lore">
            <span className="h-2 w-2 animate-pulse rounded-full bg-node-lore" />
            watching
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {rows.length} event{rows.length === 1 ? "" : "s"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={watching ? "default" : "outline"}
            size="sm"
            onClick={() => setWatching((w) => !w)}
            disabled={!projectId}
          >
            {watching ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {watching ? "Pause" : "Watch"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => emit()}
            disabled={!projectId}
          >
            <Plus className="h-3.5 w-3.5" /> Simulate change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => projectId && watchEventsRepo.clear(projectId)}
            disabled={!projectId || rows.length === 0}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="No file activity yet"
          description="The Project Watcher streams created, modified, and deleted files across your project and maps them to systems. Start watching or simulate a change to see the feed."
          action={
            <Button onClick={() => setWatching(true)} disabled={!projectId}>
              <Play className="h-4 w-4" /> Start watching
            </Button>
          }
        />
      ) : (
        <>
          {/* Filters */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2">
            <div className="flex items-center gap-1.5">
              {WATCH_KINDS.map((k) => (
                <FilterChip
                  key={k}
                  label={WATCH_KIND_LABEL[k]}
                  active={kinds.has(k)}
                  dotClass={WATCH_KIND_STYLE[k].split(" ")[0]}
                  onClick={() => toggleKind(k)}
                />
              ))}
            </div>
            {presentTypes.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">·</span>
                {presentTypes.map((t) => (
                  <FilterChip
                    key={t}
                    label={WATCH_FILE_TYPE_LABEL[t]}
                    active={!types || types.has(t)}
                    onClick={() => toggleType(t)}
                  />
                ))}
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            <ul className="divide-y divide-border">
              {visible.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  systemName={e.systemId ? systemsById.get(e.systemId) : undefined}
                />
              ))}
            </ul>
          </ScrollArea>
        </>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  dotClass,
  onClick,
}: {
  label: string;
  active: boolean;
  dotClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-border bg-accent text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent/50",
      )}
    >
      {dotClass && <span className={cn("h-2 w-2 rounded-full", dotClass)} />}
      {label}
    </button>
  );
}

function EventRow({
  event,
  systemName,
}: {
  event: WatchEvent;
  systemName?: string;
}) {
  const Icon = KIND_ICON[event.kind];
  return (
    <li className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded",
          WATCH_KIND_STYLE[event.kind],
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm">
        {event.path}
      </span>
      <span className="hidden text-[11px] text-muted-foreground sm:inline">
        {WATCH_FILE_TYPE_LABEL[event.fileType]}
      </span>
      {systemName && (
        <Link
          href={`/architecture?system=${event.systemId}`}
          className="hidden items-center gap-1 rounded-full bg-node-system/15 px-2 py-0.5 text-[11px] text-node-system hover:underline md:inline-flex"
        >
          <Boxes className="h-3 w-3" /> {systemName}
        </Link>
      )}
      <span className="shrink-0 text-xs text-muted-foreground">
        {relTime(event.createdAt)}
      </span>
    </li>
  );
}
