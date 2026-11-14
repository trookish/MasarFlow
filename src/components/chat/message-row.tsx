"use client";

import { memo, useDeferredValue, useState } from "react";
import {
  Trash2,
  Bot,
  AlertCircle,
  Check,
  Copy,
  RotateCw,
  Undo2,
  FileText,
  Info,
  CheckSquare,
  FilePlus,
} from "lucide-react";
import type { ChatMessage } from "@/lib/db/schema";
import { type FallbackTarget } from "@/lib/ai/providers/fallback";
import { parseFallbackNotice } from "@/lib/ai/providers/fallback-notice";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { MarkdownPreview } from "@/components/brain/markdown-preview";
import { GitBranch } from "lucide-react";
import type { LiveStream } from "@/lib/chat/live-stream";
import { hidesReasoning, type ToolViewMode } from "@/lib/chat/tool-groups";
import { ToolCallGroup } from "./tool-call-group";
import { UndoChips } from "./undo-chips";
import { AttachmentChip, ThinkingBlock } from "./message-parts";

/* ── One message row ──────────────────────────────────────────────────── */

/**
 * One message row. Memoized so a streaming turn only re-renders the row
 * whose `live` stream is changing — other messages (and their markdown
 * re-parsing) stay untouched on every chunk. The callbacks are stable in
 * behavior, so the comparator ignores their per-render identities.
 */
export const MessageRow = memo(
  function MessageRow({
    message: m,
    live,
    showTimestamps,
    busy,
    onCopy,
    onDelete,
    onRegenerate,
    onSaveCodeAsNote,
    onCreateTask,
    onCreateNote,
    onUndoFiles,
    onKeepModel,
    toolView,
    sideChatId,
    onStartSideChat,
  }: {
    message: ChatMessage;
    live: LiveStream | null;
    showTimestamps: boolean;
    busy: boolean;
    onCopy: () => void;
    onDelete: () => void;
    onRegenerate: () => void;
    onSaveCodeAsNote: (code: string, language: string) => void;
    onCreateTask: () => void;
    onCreateNote: () => void;
    onUndoFiles?: () => void;
    /** Accept a fallback switch shown on a notice ("Keep using this model"). */
    onKeepModel?: (threadId: string, target: FallbackTarget) => void;
    /** How tool calls render in this reply (Verbose, Normal or Summary). */
    toolView: ToolViewMode;
    /** The side chat already branched from this message, if any. */
    sideChatId?: string | null;
    /** Start (or open) a side chat from this message; absent inside a side chat. */
    onStartSideChat?: () => void;
  }) {
    const [copied, setCopied] = useState(false);
    const content = live ? live.text : m.content;
    const reasoning = live ? live.reasoning : (m.reasoning ?? "");
    const toolActivity = live ? live.tools : (m.toolActivity ?? []);
    const notices = live ? live.notices : (m.notices ?? []);
    const files = live ? live.files : (m.files ?? []);
    const attachments = m.attachments ?? [];
    const isUser = m.role === "user";
    // Streaming deltas arrive faster than react-markdown can re-parse the
    // whole message. useDeferredValue keeps the UI responsive on long
    // responses: the raw text stays current while the expensive markdown
    // render is deferred and can be interrupted by React.
    const renderedContent = useDeferredValue(content);

    return (
      <div className={cn("group flex gap-3", isUser && "flex-row-reverse")}>
        {!isUser && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Bot className="h-4 w-4" />
          </span>
        )}
        <div
          className={cn("min-w-0 pt-0.5", isUser ? "max-w-[85%]" : "flex-1")}
        >
          {showTimestamps && (
            <div
              className={cn(
                "mb-0.5 text-xs text-muted-foreground",
                isUser && "text-right",
              )}
            >
              {new Date(m.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}

          {attachments.length > 0 && (
            <div
              className={cn(
                "mb-1.5 flex flex-wrap gap-2",
                isUser && "justify-end",
              )}
            >
              {attachments.map((a, i) => (
                <AttachmentChip key={`${a.name}-${i}`} attachment={a} />
              ))}
            </div>
          )}

          {notices.map((n, i) => {
            const { text: noticeText, keep } = parseFallbackNotice(n);
            return (
              <p
                key={i}
                className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Info className="h-3 w-3 shrink-0" /> {noticeText}
                {keep && onKeepModel && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onKeepModel(m.threadId, keep)}
                    className="h-5 px-1.5 text-xs"
                  >
                    Keep using this model
                  </Button>
                )}
              </p>
            );
          })}

          <ToolCallGroup calls={toolActivity} mode={toolView} />

          {(files.length > 0 || onUndoFiles) && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1">
              {files.map((f, i) => (
                <span
                  key={`${f}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-accent/40 px-2 py-0.5 text-xs text-muted-foreground"
                  title={`Edited file: ${f}`}
                >
                  <FileText className="h-3 w-3 text-node-lore-fg" />
                  <span className="max-w-52 truncate">{f}</span>
                </span>
              ))}
              {!live && onUndoFiles && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Undo this reply's file changes"
                  title="Revert the file changes this reply made"
                  disabled={busy}
                  onClick={onUndoFiles}
                  className="h-5 w-5"
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}

          {!live && <UndoChips messageId={m.id} busy={busy} />}

          {reasoning && !hidesReasoning(toolView) && (
            <ThinkingBlock
              text={reasoning}
              streaming={Boolean(live) && !content}
            />
          )}

          {isUser ? (
            <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
              {content}
            </div>
          ) : (
            // Assistant replies render as markdown both persisted and live —
            // partial markdown while streaming degrades gracefully.
            <>
              {(content || live) && (
                <div className="text-sm">
                  <MarkdownPreview
                    content={renderedContent}
                    onSaveCodeAsNote={onSaveCodeAsNote}
                  />
                  {live && (
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-text-bottom" />
                  )}
                </div>
              )}
              {/* A message left mid-stream by a dead session (refresh, crash,
                thread switch) renders as interrupted instead of a silent
                blank bubble — legacy records with no status and no content
                are the same case. */}
              {!live &&
                m.role === "assistant" &&
                (m.status === "streaming" ||
                  (m.status === undefined &&
                    !m.content.trim() &&
                    !m.error)) && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    The response was interrupted before it finished.
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRegenerate}
                      disabled={busy}
                    >
                      <RotateCw className="h-3 w-3" /> Retry
                    </Button>
                  </div>
                )}
              {m.error && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {m.error}
                  {m.error !== "Stopped." && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRegenerate}
                      disabled={busy}
                    >
                      <RotateCw className="h-3 w-3" /> Retry
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Hover actions */}
          {!live && (m.content || m.error) && (
            <div
              className={cn(
                "mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100",
                isUser && "justify-end",
              )}
            >
              {m.content && (
                <Tooltip label={copied ? "Copied!" : "Copy"} side="bottom">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy message"
                    onClick={() => {
                      onCopy();
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    }}
                    className="h-6 w-6 text-muted-foreground"
                  >
                    {copied ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </Tooltip>
              )}
              {m.content && (
                <>
                  <Tooltip label="Create task" side="bottom">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Create task from this message"
                      onClick={onCreateTask}
                      className="h-6 w-6 text-muted-foreground"
                    >
                      <CheckSquare className="h-3 w-3" />
                    </Button>
                  </Tooltip>
                  <Tooltip label="Save as note" side="bottom">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Save this message as a note"
                      onClick={onCreateNote}
                      className="h-6 w-6 text-muted-foreground"
                    >
                      <FilePlus className="h-3 w-3" />
                    </Button>
                  </Tooltip>
                </>
              )}
              {onStartSideChat && m.content && (
                <Tooltip
                  label={sideChatId ? "Open side chat" : "Start side chat"}
                  side="bottom"
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      sideChatId
                        ? "Open the side chat branched from this message"
                        : "Start a side chat from this message"
                    }
                    onClick={onStartSideChat}
                    disabled={busy}
                    className={cn(
                      "h-6 w-6 text-muted-foreground",
                      sideChatId && "text-primary",
                    )}
                  >
                    <GitBranch className="h-3 w-3" />
                  </Button>
                </Tooltip>
              )}
              {m.role === "assistant" && (
                <Tooltip label="Regenerate" side="bottom">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Regenerate reply"
                    onClick={onRegenerate}
                    disabled={busy}
                    className="h-6 w-6 text-muted-foreground"
                  >
                    <RotateCw className="h-3 w-3" />
                  </Button>
                </Tooltip>
              )}
              <Tooltip label="Delete" side="bottom">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete message"
                  onClick={onDelete}
                  disabled={busy}
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.message === next.message &&
    prev.live === next.live &&
    prev.showTimestamps === next.showTimestamps &&
    prev.busy === next.busy &&
    prev.toolView === next.toolView &&
    prev.sideChatId === next.sideChatId &&
    Boolean(prev.onStartSideChat) === Boolean(next.onStartSideChat),
);
