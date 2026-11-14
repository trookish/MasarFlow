"use client";

import {
  TOOL_VIEW_HINTS,
  TOOL_VIEW_LABELS,
  TOOL_VIEW_MODES,
  type ToolViewMode,
} from "@/lib/chat/tool-groups";
import { cn } from "@/lib/utils/cn";

/**
 * Segmented control in the controls row: Verbose / Normal / Summary decides
 * how the tool calls of every assistant reply render.
 */
export function ToolViewSwitch({
  value,
  onChange,
}: {
  value: ToolViewMode;
  onChange: (mode: ToolViewMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tool call view"
      title="How tool calls appear in replies"
      className="flex shrink-0 items-center rounded-md border border-border bg-muted/30 p-0.5"
    >
      {TOOL_VIEW_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          aria-label={`${TOOL_VIEW_LABELS[m]} tool call view`}
          title={TOOL_VIEW_HINTS[m]}
          onClick={() => onChange(m)}
          className={cn(
            "rounded px-2 py-0.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            value === m
              ? "bg-card font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {TOOL_VIEW_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
