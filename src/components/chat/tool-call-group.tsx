"use client";

import { useId, useState } from "react";
import { Check, ChevronRight, Loader2, Wrench, X } from "lucide-react";
import type { ToolActivity } from "@/lib/db/schema";
import { prettyToolName } from "@/lib/chat/live-stream";
import {
  TOOL_STATUS_LABELS,
  formatToolArguments,
  groupToolCalls,
  presentToolGroup,
  toolCallStatus,
  toolCountChip,
  toolGroupSummary,
  type ToolViewMode,
} from "@/lib/chat/tool-groups";
import { cn } from "@/lib/utils/cn";

/**
 * The tool calls of one assistant reply. Verbose opens the group, Normal
 * collapses it unless a call failed, Summary shows only a count chip. The
 * header is a real button: Enter and Space toggle it.
 */
export function ToolCallGroup({
  calls,
  mode,
}: {
  calls: readonly ToolActivity[];
  mode: ToolViewMode;
}) {
  const group = groupToolCalls(calls);
  const view = presentToolGroup(mode, group);
  // The user's own toggle overrides the mode's default until the mode changes.
  const [choice, setChoice] = useState<{
    mode: ToolViewMode;
    open: boolean;
  } | null>(null);
  const open = choice && choice.mode === mode ? choice.open : view.defaultOpen;
  const bodyId = useId();

  if (!group) return null;

  if (view.showChip) {
    return (
      <p
        className="mb-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-accent/40 px-2 py-0.5 text-xs text-muted-foreground"
        data-testid="tool-count-chip"
        title="Tool calls this reply made. Switch the tool call view to see them."
      >
        <Wrench className="h-3 w-3" aria-hidden />
        {toolCountChip(group)}
      </p>
    );
  }

  return (
    <div
      className="mb-1.5 rounded-md border border-border bg-accent/20"
      data-testid="tool-call-group"
      data-open={open}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        title={open ? "Collapse tool calls" : "Expand tool calls"}
        onClick={() => setChoice({ mode, open: !open })}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <Wrench className="h-3 w-3 shrink-0" aria-hidden />
        <span
          className={cn("truncate", group.failed > 0 && "text-destructive")}
          data-testid="tool-group-summary"
        >
          {toolGroupSummary(group)}
        </span>
        {group.running > 0 && (
          <Loader2
            className="h-3 w-3 shrink-0 animate-spin text-primary"
            aria-hidden
          />
        )}
      </button>
      {open && (
        <ul
          id={bodyId}
          className="space-y-1 border-t border-border/60 px-2 py-1.5"
        >
          {group.calls.map((call, i) => (
            <ToolCallRow key={call.id ?? `${call.name}-${i}`} call={call} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolCallRow({ call }: { call: ToolActivity }) {
  const status = toolCallStatus(call);
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const args = formatToolArguments(call.arguments);
  const hasDetail = Boolean(args) || Boolean(call.result);
  return (
    <li data-testid="tool-call" data-status={status} data-tool={call.name}>
      <button
        type="button"
        aria-expanded={hasDetail ? open : undefined}
        aria-controls={hasDetail ? detailId : undefined}
        disabled={!hasDetail}
        title={
          hasDetail ? "Show arguments and result" : call.summary || call.name
        }
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-xs focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
            !hasDetail && "opacity-30",
          )}
          aria-hidden
        />
        <span className="font-medium">{prettyToolName(call.name)}</span>
        {call.summary && (
          <span className="min-w-0 truncate text-muted-foreground">
            {call.summary}
          </span>
        )}
        <span
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-1",
            status === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {status === "running" ? (
            <Loader2
              className="h-3 w-3 animate-spin text-primary"
              aria-hidden
            />
          ) : status === "ok" ? (
            <Check className="h-3 w-3 text-node-lore-fg" aria-hidden />
          ) : (
            <X className="h-3 w-3" aria-hidden />
          )}
          {TOOL_STATUS_LABELS[status]}
        </span>
      </button>
      {open && hasDetail && (
        <div id={detailId} className="mt-1 space-y-1 pl-4">
          {args && (
            <div>
              <p className="text-xs text-muted-foreground">Arguments</p>
              <pre className="max-h-40 overflow-auto rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs whitespace-pre-wrap">
                {args}
              </pre>
            </div>
          )}
          {call.result && (
            <div>
              <p className="text-xs text-muted-foreground">Result</p>
              <pre className="max-h-48 overflow-auto rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs whitespace-pre-wrap">
                {call.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
