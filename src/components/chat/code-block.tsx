"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Fenced code block with a toolbar: language badge, copy, and (when a handler
 * is provided) "save as note". The highlighted <code> tree arrives as
 * children — highlighting is done upstream by rehype-highlight in
 * MarkdownPreview; `rawText` carries the plain source for copy/save.
 */
export function CodeBlock({
  language,
  rawText,
  onSaveAsNote,
  children,
}: {
  language: string;
  rawText: string;
  onSaveAsNote?: (code: string, language: string) => void;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="group/code my-3 overflow-hidden rounded-md border border-border bg-muted">
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {language}
        </span>
        <span className="flex items-center gap-0.5">
          {onSaveAsNote && (
            <Tooltip label="Save as note" side="bottom">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Save code block as note"
                onClick={() => onSaveAsNote(rawText, language)}
                className="h-6 w-6 text-muted-foreground"
              >
                <NotebookPen className="h-3 w-3" />
              </Button>
            </Tooltip>
          )}
          <Tooltip label={copied ? "Copied!" : "Copy code"} side="bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy code"
              onClick={copy}
              className="h-6 w-6 text-muted-foreground"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </Tooltip>
        </span>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        {children}
      </pre>
    </div>
  );
}
