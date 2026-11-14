"use client";

import {
  Send,
  Square,
  AlertCircle,
  Check,
  X,
  Paperclip,
  Mic,
  MicOff,
  FileText,
  ImageIcon,
  AtSign,
  Hash,
} from "lucide-react";
import { ApprovalCard } from "@/components/ai/approval-card";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { MentionMenu } from "./mention-menu";
import type { LiveStream } from "@/lib/chat/live-stream";
import type { LegacyApproval } from "./run-chat-turn";
import type { ComposerHandle } from "./use-composer";

export function Composer({
  composer,
  legacyApproval,
  setLegacyApproval,
  sendError,
  inlineNotice,
  stream,
  mode,
  canUseImages,
  projectId,
  send,
  stop,
}: {
  composer: ComposerHandle;
  legacyApproval: LegacyApproval | null;
  setLegacyApproval: (value: LegacyApproval | null) => void;
  sendError: string | null;
  inlineNotice: string | null;
  stream: LiveStream | null;
  mode: "agentic" | "chat";
  canUseImages: boolean;
  projectId: string | null;
  send: () => Promise<void>;
  stop: () => void;
}) {
  const {
    input,
    setInput,
    interim,
    pending,
    setPending,
    attachError,
    mentions,
    trigger,
    setTrigger,
    anchor,
    setAnchor,
    fileInputRef,
    textareaRef,
    menuRef,
    speech,
    onFilePick,
    onPaste,
    updateTrigger,
    onMentionSelect,
    removeMention,
  } = composer;
  const sendDisabled =
    (!input.trim() && pending.length === 0) || Boolean(stream);

  return (
    <div className="shrink-0 border-t border-border p-3">
      <div className="mx-auto max-w-3xl">
        {legacyApproval && (
          <ApprovalCard
            request={legacyApproval.request}
            allowRemember={false}
            onSettle={(allowed) => {
              legacyApproval.resolve(allowed);
              setLegacyApproval(null);
            }}
          />
        )}
        {attachError && (
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {attachError}
          </p>
        )}
        {sendError && (
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {sendError}
          </p>
        )}
        {inlineNotice && (
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-primary">
            <Check className="h-3.5 w-3.5 shrink-0" /> {inlineNotice}
          </p>
        )}
        {pending.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((p, i) => (
              <span
                key={`${p.attachment.name}-${i}`}
                className="group relative inline-flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1 text-xs"
              >
                {p.attachment.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.attachment.dataUrl}
                    alt={p.attachment.name}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="max-w-36 truncate">{p.attachment.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${p.attachment.name}`}
                  onClick={() =>
                    setPending((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {mentions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {mentions.map((m) => (
              <span
                key={m.uid}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs"
              >
                {m.kind === "page" ? (
                  <AtSign className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Hash className="h-3.5 w-3.5 text-primary" />
                )}
                <span className="max-w-40 truncate">
                  {m.kind === "page" ? m.label : `#${m.title}`}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${m.token}`}
                  onClick={() => removeMention(m.uid)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative flex items-end gap-2 rounded-lg border border-border bg-card p-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={
              canUseImages
                ? "image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.csv,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.cs,.sql,.sh,.toml,.log"
                : ".txt,.md,.json,.csv,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.cs,.sql,.sh,.toml,.log"
            }
            onChange={onFilePick}
            className="hidden"
          />
          <Tooltip
            label={
              canUseImages
                ? "Attach images or text files"
                : "Attach text files (this model can't see images)"
            }
            side="top"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Attach files"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(stream)}
            >
              {canUseImages ? (
                <ImageIcon className="h-4 w-4" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>
          </Tooltip>
          {speech.supported && (
            <Tooltip
              label={
                speech.listening ? "Stop dictation" : "Dictate with your voice"
              }
              side="top"
            >
              <Button
                variant={speech.listening ? "default" : "ghost"}
                size="icon-sm"
                aria-label={
                  speech.listening ? "Stop dictation" : "Start dictation"
                }
                onClick={() =>
                  speech.listening ? speech.stop() : speech.start()
                }
                className={cn(speech.listening && "animate-pulse")}
              >
                {speech.listening ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            </Tooltip>
          )}
          <div className="relative min-w-0 flex-1">
            <Textarea
              ref={textareaRef}
              value={interim ? `${input}${input ? " " : ""}${interim}` : input}
              onChange={(e) => {
                setInput(e.target.value);
                updateTrigger();
              }}
              onPaste={onPaste}
              onSelect={updateTrigger}
              onKeyUp={updateTrigger}
              onClick={updateTrigger}
              onKeyDown={(e) => {
                if (trigger && menuRef.current?.handleKeyDown(e)) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={
                speech.listening
                  ? "Listening… speak now"
                  : mode === "agentic"
                    ? "Ask about — or change — anything in your workspace…"
                    : "Message the model directly…"
              }
              rows={1}
              className="max-h-40 min-h-[38px] w-full resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
            />
            {trigger && (
              <MentionMenu
                ref={menuRef}
                kind={trigger.kind}
                query={trigger.query}
                projectId={projectId}
                anchor={anchor}
                onSelect={onMentionSelect}
                onClose={() => {
                  setTrigger(null);
                  setAnchor(null);
                }}
              />
            )}
          </div>
          {stream ? (
            <Button
              variant="outline"
              size="icon"
              aria-label="Stop"
              onClick={stop}
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              aria-label="Send"
              onClick={() => void send()}
              disabled={sendDisabled}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Type{" "}
          <kbd className="rounded border border-border bg-muted px-1">/</kbd>{" "}
          commands ·{" "}
          <kbd className="rounded border border-border bg-muted px-1">@</kbd>{" "}
          pages ·{" "}
          <kbd className="rounded border border-border bg-muted px-1">#</kbd>{" "}
          records
        </p>
        {speech.error && (
          <p className="mt-1 text-xs text-destructive">{speech.error}</p>
        )}
      </div>
    </div>
  );
}
