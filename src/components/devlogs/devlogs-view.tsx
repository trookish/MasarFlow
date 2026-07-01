"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  ChevronDown,
  ScrollText,
  GitCommit,
  Boxes,
  Bot,
  PenTool,
  FileText,
  KanbanSquare,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { devLogsRepo } from "@/lib/db/repos";
import type { DevLog, EntityKind } from "@/lib/db/schema";
import {
  DEVLOG_TYPES,
  DEVLOG_TYPE_LABEL,
  DEVLOG_TYPE_COLOR,
  groupLogs,
  type DevLogType,
} from "@/lib/devlogs";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MarkdownPreview } from "@/components/brain/markdown-preview";

const TYPE_ICON: Record<DevLogType, LucideIcon> = {
  commit: GitCommit,
  change: Pencil,
  system: Boxes,
  agent: Bot,
  note: PenTool,
  spec: FileText,
  task: KanbanSquare,
};

/** Deep-link to the referenced entity, or null if it has no dedicated route. */
function refHref(refType: EntityKind | null, refId: string | null): string | null {
  if (!refType || !refId) return null;
  switch (refType) {
    case "note":
      return `/brain?note=${refId}`;
    case "spec":
      return `/specs?spec=${refId}`;
    case "task":
      return `/tasks?task=${refId}`;
    case "system":
      return `/architecture?system=${refId}`;
    case "doc":
      return `/docs?doc=${refId}`;
    default:
      return null;
  }
}

function relativeTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function DevLogsView() {
  const projectId = useActiveProjectId();
  const { showTime, groupBy } = usePageSettings((s) => s.devlogs);
  const [active, setActive] = useState<Set<DevLogType>>(
    () => new Set(DEVLOG_TYPES),
  );
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const logsRaw = useLiveQuery(
    () => devLogsRepo.listByProject(projectId),
    [projectId],
  );
  const logs = useMemo(() => logsRaw ?? [], [logsRaw]);

  const filtered = useMemo(
    () => logs.filter((l) => active.has(l.type as DevLogType)),
    [logs, active],
  );
  const groups = useMemo(() => groupLogs(filtered, groupBy), [filtered, groupBy]);

  function toggle(type: DevLogType) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function createEntry(data: ComposerData) {
    if (!projectId) return;
    await devLogsRepo.create({ projectId, ...data });
    setComposing(false);
  }

  async function saveEdit(id: string, data: ComposerData) {
    await devLogsRepo.update(id, data);
    setEditingId(null);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: type filters + New entry */}
      <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-3">
        {DEVLOG_TYPES.map((type) => {
          const on = active.has(type);
          const Icon = TYPE_ICON[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                on
                  ? "border-border bg-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", on && DEVLOG_TYPE_COLOR[type])} />
              {DEVLOG_TYPE_LABEL[type]}
            </button>
          );
        })}
        <div className="ml-auto shrink-0">
          <Button
            size="sm"
            onClick={() => {
              setComposing(true);
              setEditingId(null);
            }}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" /> New entry
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl px-5 py-5">
          {composing && (
            <DevLogComposer
              onSave={createEntry}
              onCancel={() => setComposing(false)}
            />
          )}

          {groups.length === 0 && !composing ? (
            <EmptyState
              icon={ScrollText}
              title="No log entries"
              description="Keep a running journal of changes, commits, and decisions. Filter by type to focus the timeline."
              action={
                <Button onClick={() => setComposing(true)} disabled={!projectId}>
                  <Plus className="h-4 w-4" /> New entry
                </Button>
              }
            />
          ) : (
            groups.map((group) => (
              <div key={group.key} className="mb-6">
                <h2 className="sticky top-0 z-10 mb-3 bg-background/80 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
                  {group.label}
                </h2>
                <ol className="relative ml-2 border-l border-border">
                  {group.logs.map((log) =>
                    editingId === log.id ? (
                      <li key={log.id} className="mb-4 ml-5">
                        <DevLogComposer
                          initial={log}
                          onSave={(data) => saveEdit(log.id, data)}
                          onCancel={() => setEditingId(null)}
                        />
                      </li>
                    ) : (
                      <DevLogItem
                        key={log.id}
                        log={log}
                        showTime={showTime}
                        onEdit={() => {
                          setEditingId(log.id);
                          setComposing(false);
                        }}
                        onDelete={() => devLogsRepo.remove(log.id)}
                      />
                    ),
                  )}
                </ol>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function DevLogItem({
  log,
  showTime,
  onEdit,
  onDelete,
}: {
  log: DevLog;
  showTime: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const type = log.type as DevLogType;
  const Icon = TYPE_ICON[type];
  const href = refHref(log.refType, log.refId);

  return (
    <li className="group relative mb-4 ml-5">
      {/* Timeline node */}
      <span className="absolute top-1 -left-[26px] flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background bg-border">
        <Icon className={cn("h-2.5 w-2.5", DEVLOG_TYPE_COLOR[type])} />
      </span>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{log.title}</span>
            <Badge variant="outline" className="capitalize">
              {DEVLOG_TYPE_LABEL[type]}
            </Badge>
            {showTime && (
              <span className="text-xs text-muted-foreground">
                {relativeTime(log.createdAt)}
              </span>
            )}
            {href && (
              <Link
                href={href}
                className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                open <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          {log.body && (
            <div className="mt-1 text-sm text-muted-foreground">
              <MarkdownPreview content={log.body} />
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit entry"
            onClick={onEdit}
            className="text-muted-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete entry"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}

interface ComposerData {
  title: string;
  type: DevLogType;
  body: string;
}

function DevLogComposer({
  initial,
  onSave,
  onCancel,
}: {
  initial?: DevLog;
  onSave: (data: ComposerData) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<DevLogType>(
    (initial?.type as DevLogType) ?? "change",
  );
  const [body, setBody] = useState(initial?.body ?? "");

  const canSave = title.trim().length > 0;

  return (
    <div className="mb-5 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What happened?"
          className="h-9 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSave) onSave({ title: title.trim(), type, body });
            if (e.key === "Escape") onCancel();
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" size="sm">
              <span className="capitalize">{DEVLOG_TYPE_LABEL[type]}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {DEVLOG_TYPES.map((t) => (
              <DropdownMenuItem
                key={t}
                active={t === type}
                onSelect={() => setType(t)}
              >
                <span className="capitalize">{DEVLOG_TYPE_LABEL[t]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Details (Markdown supported)…"
        rows={2}
        className="mt-2 text-sm"
      />

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() => onSave({ title: title.trim(), type, body })}
        >
          <Check className="h-3.5 w-3.5" /> {initial ? "Save" : "Add entry"}
        </Button>
      </div>
    </div>
  );
}
