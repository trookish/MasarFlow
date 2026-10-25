"use client";

import { Database, ShieldAlert, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** What the card needs to know about a pending tool call. */
export interface ApprovalLike {
  name: string;
  arguments: Record<string, unknown>;
  rootLabel?: string;
  /** "workspace" for changes to workspace records (agent runs); file and shell calls otherwise */
  scope?: "files" | "workspace";
}

const VERB: Record<string, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  remove: "Remove",
};

/** Headline and detail for a request, in plain words. Exported for tests. */
export function describeApproval(req: ApprovalLike): {
  headline: string;
  detail: string;
  shell: boolean;
  record: boolean;
} {
  const a = req.arguments;
  if (
    req.name === "shell_run" ||
    req.name === "run_command" ||
    req.name === "bash"
  ) {
    return {
      headline: "Run this command?",
      detail: String(a.command ?? ""),
      shell: true,
      record: false,
    };
  }
  if (
    req.name === "fs_write" ||
    req.name === "write_file" ||
    req.name === "edit"
  ) {
    return {
      headline: "Edit this file?",
      detail: String(a.path ?? ""),
      shell: false,
      record: false,
    };
  }
  const m = /^(create|update|delete|remove)_(\w+)$/.exec(req.name);
  if (req.scope === "workspace" || m) {
    const verb = m ? VERB[m[1]] : "Change";
    const kind = m ? m[2].replace(/_/g, " ") : "record";
    const label = String(a.title ?? a.name ?? a.label ?? a.id ?? "");
    return {
      headline: `${verb} ${kind}?`,
      detail: label ? `${kind}: ${label}` : req.name,
      shell: false,
      record: true,
    };
  }
  return {
    headline: `Allow "${req.name}"?`,
    detail: req.rootLabel ?? req.name,
    shell: false,
    record: false,
  };
}

/** Permission card shared by Chat, Agents and Workflow. */
export function ApprovalCard({
  request,
  allowRemember = true,
  onSettle,
}: {
  request: ApprovalLike;
  /** Show the "Always allow" shortcut (only where the session can remember it). */
  allowRemember?: boolean;
  onSettle: (allowed: boolean, remember: boolean) => void;
}) {
  const { headline, detail, shell, record } = describeApproval(request);
  const where = record
    ? "Workspace change requested by the agent"
    : request.rootLabel
      ? `Permission request · ${request.rootLabel}`
      : "Permission request";

  return (
    <div
      className="mb-2 overflow-hidden rounded-md border border-warning/50 bg-card"
      data-testid="approval-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium">{headline}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {where}
          </div>
        </div>
      </div>
      <div className="px-3 py-2">
        <div
          className={cn(
            "flex items-start gap-1.5 rounded bg-muted px-2.5 py-1.5 font-mono text-xs",
            (shell || record) && "items-center",
          )}
        >
          {shell && (
            <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {record && (
            <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="break-all">{detail}</span>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSettle(false, false)}
        >
          Deny
        </Button>
        {allowRemember && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSettle(true, true)}
          >
            Always allow{shell && detail ? ` "${detail.split(/\s+/)[0]}"` : ""}
          </Button>
        )}
        <Button size="sm" onClick={() => onSettle(true, false)}>
          Approve
        </Button>
      </div>
    </div>
  );
}
