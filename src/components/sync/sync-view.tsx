"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import {
  RefreshCw,
  UploadCloud,
  FileText,
  PenTool,
  BookOpen,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { notesRepo, docsRepo, syncRepo } from "@/lib/db/repos";
import type { EntityKind, SyncFile } from "@/lib/db/schema";
import {
  buildDesiredFiles,
  reconcile,
  summarize,
  SYNC_STATUS_LABEL,
  type SyncStatus,
  type SyncFileState,
} from "@/lib/sync";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";

// Status → pill colors (themeable node tokens).
const STATUS_STYLE: Record<SyncStatus, string> = {
  new: "bg-node-spec/15 text-node-spec",
  local_modified: "bg-node-idea/15 text-node-idea",
  remote_modified: "bg-node-system/15 text-node-system",
  conflict: "bg-node-decision/15 text-node-decision",
  synced: "bg-node-lore/15 text-node-lore",
};

// Filter bar order.
const FILTER_ORDER: SyncStatus[] = [
  "new",
  "local_modified",
  "synced",
  "conflict",
];

const ENTITY_ICON: Partial<Record<EntityKind, LucideIcon>> = {
  note: PenTool,
  doc: BookOpen,
};

function entityHref(type: EntityKind, id: string): string | null {
  if (type === "note") return `/brain?note=${id}`;
  if (type === "doc") return `/docs?doc=${id}`;
  return null;
}

function relTime(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function SyncView() {
  const projectId = useActiveProjectId();
  const [filter, setFilter] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const files = useLiveQuery(
    () => syncRepo.listByProject(projectId),
    [projectId],
  );
  const rows = useMemo(() => files ?? [], [files]);
  const counts = useMemo(() => summarize(rows), [rows]);
  const pending = counts.new + counts.local_modified;

  const visible = useMemo(
    () => (filter ? rows.filter((f) => f.status === filter) : rows),
    [rows, filter],
  );

  /** Build the desired vault from the live entities. */
  async function desiredStates(): Promise<SyncFileState[]> {
    const [notes, docs] = await Promise.all([
      notesRepo.listByProject(projectId),
      docsRepo.listByProject(projectId),
    ]);
    const desired = buildDesiredFiles(notes, docs);
    const existing = await syncRepo.listByProject(projectId);
    return reconcile(desired, existing);
  }

  async function handleScan() {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      const states = await desiredStates();
      await syncRepo.replaceAll(projectId, states);
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      const states = await desiredStates();
      const ts = Date.now();
      // Committing the vault marks every file synced at the current hash.
      await syncRepo.replaceAll(
        projectId,
        states.map((s) => ({ ...s, status: "synced", lastSyncedAt: ts })),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Vault sync</span>
        <span className="text-xs text-muted-foreground">
          {rows.length} file{rows.length === 1 ? "" : "s"}
          {pending > 0 ? ` · ${pending} pending` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScan}
            disabled={!projectId || busy}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
            Scan workspace
          </Button>
          <Button
            size="sm"
            onClick={handleSync}
            disabled={!projectId || busy || pending === 0}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Sync now{pending > 0 ? ` (${pending})` : ""}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="Nothing scanned yet"
          description="Scan the workspace to build a Markdown vault index from your notes and docs. Each scan detects which files are new or modified; Sync commits them."
          action={
            <Button onClick={handleScan} disabled={!projectId || busy}>
              <RefreshCw className="h-4 w-4" /> Scan workspace
            </Button>
          }
        />
      ) : (
        <>
          {/* Status filter chips */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
            <FilterChip
              label="All"
              count={rows.length}
              active={filter === null}
              onClick={() => setFilter(null)}
            />
            {FILTER_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <FilterChip
                key={s}
                label={SYNC_STATUS_LABEL[s]}
                count={counts[s]}
                active={filter === s}
                dotClass={STATUS_STYLE[s]}
                onClick={() => setFilter(filter === s ? null : s)}
              />
            ))}
          </div>

          <ScrollArea className="flex-1">
            <ul className="divide-y divide-border">
              {visible.map((f) => (
                <FileRow key={f.id} file={f} />
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
  count,
  active,
  dotClass,
  onClick,
}: {
  label: string;
  count: number;
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
      {dotClass && (
        <span className={cn("h-2 w-2 rounded-full", dotClass.split(" ")[0])} />
      )}
      {label}
      <span className="text-muted-foreground">{count}</span>
    </button>
  );
}

function FileRow({ file }: { file: SyncFile }) {
  const Icon = ENTITY_ICON[file.entityType ?? "note"] ?? FileText;
  const href =
    file.entityType && file.entityId
      ? entityHref(file.entityType, file.entityId)
      : null;
  const status = file.status as SyncStatus;

  return (
    <li className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-sm">
        {file.path}
      </span>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {relTime(file.lastSyncedAt)}
      </span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium",
          STATUS_STYLE[status],
        )}
      >
        {SYNC_STATUS_LABEL[status]}
      </span>
      {href && (
        <Link
          href={href}
          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
          aria-label="Open entity"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </li>
  );
}
