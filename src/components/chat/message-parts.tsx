"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  BrainCircuit,
  FileText,
} from "lucide-react";
import type { ChatAttachment } from "@/lib/db/schema";

export function AttachmentChip({
  attachment: a,
}: {
  attachment: ChatAttachment;
}) {
  if (a.kind === "image" && a.dataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={a.dataUrl}
        alt={a.name}
        title={a.name}
        className="h-24 max-w-48 rounded-md border border-border object-cover"
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1 text-xs">
      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="max-w-40 truncate">{a.name}</span>
    </span>
  );
}

/** Collapsible extended-thinking block. */
export function ThinkingBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const show = open || streaming;
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {show ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <BrainCircuit className="h-3 w-3" />
        Thinking{streaming ? "…" : ""}
      </button>
      {show && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
}
