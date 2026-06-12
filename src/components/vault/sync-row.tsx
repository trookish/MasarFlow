"use client";
import * as React from "react";
import { FileText, Trash2, AlertTriangle, Check, ArrowDown, ArrowUp, RefreshCw, FilePlus2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SyncFile } from "@/lib/db/schema";
import { formatRelativeTime, pluralize } from "@/lib/utils";

const STATUS_META: Record<SyncFile["status"], { label: string; color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  synced: { label: "Synced", color: "var(--success)", icon: Check },
  "local-newer": { label: "Local newer", color: "var(--info)", icon: ArrowUp },
  "remote-newer": { label: "Remote newer", color: "var(--info)", icon: ArrowDown },
  conflict: { label: "Conflict", color: "var(--danger)", icon: AlertTriangle },
  "deleted-local": { label: "Deleted (local)", color: "var(--warning)", icon: Trash2 },
  "deleted-remote": { label: "Deleted (vault)", color: "var(--warning)", icon: Trash2 },
  trash: { label: "In trash", color: "var(--muted-foreground)", icon: Trash2 },
  ignored: { label: "Ignored", color: "var(--muted-foreground)", icon: FileText },
};

export function SyncRow({ file, onAction, onOpen }: { file: SyncFile; onAction: (action: "pull" | "push" | "open") => void; onOpen?: () => void; }) {
  const meta = STATUS_META[file.status];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card/60 p-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-2 text-muted-foreground">
        {file.inTrash ? <Trash2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{file.relativePath.split("/").pop()}</div>
        <div className="truncate text-[10px] text-muted-foreground">{file.relativePath}</div>
      </div>
      <Badge variant="outline" className="gap-1 text-[10px]" style={{ borderColor: meta.color, color: meta.color }}>
        <Icon className="h-3 w-3" />{meta.label}
      </Badge>
      {file.isTemplate && <Badge variant="ghost" className="text-[10px]">template</Badge>}
      <div className="flex items-center gap-1">
        {file.noteId && onOpen && <Button size="icon-sm" variant="ghost" onClick={onOpen} title="Open note"><FileText className="h-3 w-3" /></Button>}
        <Button size="icon-sm" variant="ghost" onClick={() => onAction("pull")} title="Pull from vault"><ArrowDown className="h-3 w-3" /></Button>
        <Button size="icon-sm" variant="ghost" onClick={() => onAction("push")} title="Push to vault"><ArrowUp className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

export function SyncRowCompact({ file }: { file: SyncFile }) {
  const meta = STATUS_META[file.status];
  const Icon = meta.icon;
  return (
    <div className={cn("flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5 text-[11px]")}>
      <Icon as-any="" className="h-3 w-3 shrink-0" style={{ color: meta.color }} />
      <span className="truncate font-medium">{file.relativePath.split("/").pop()}</span>
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(file.lastSyncedAt)}</span>
    </div>
  );
}
