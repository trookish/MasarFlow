"use client";

import { MessageRow } from "./message-row";
import { Suggestions } from "./suggestions";
import { useEffect, useRef } from "react";
import { chatMessagesRepo } from "@/lib/db/repos";
import type { ChatMessage } from "@/lib/db/schema";
import { type FallbackTarget } from "@/lib/ai/providers/fallback";
import { cn } from "@/lib/utils/cn";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LiveStream } from "@/lib/chat/live-stream";
import type { ToolViewMode } from "@/lib/chat/tool-groups";
import type { MessageActions } from "./use-message-actions";

export function Transcript({
  messages,
  mode,
  density,
  showTimestamps,
  stream,
  setInput,
  toolView,
  isSide,
  sideChatByMessage,
  startSideChat,
  actions,
  regenerate,
  keepModel,
}: {
  messages: ChatMessage[];
  mode: "agentic" | "chat";
  density: "compact" | "comfortable";
  showTimestamps: boolean;
  stream: LiveStream | null;
  setInput: (value: string) => void;
  toolView: ToolViewMode;
  /** True inside a side chat: no nested side chats. */
  isSide: boolean;
  /** Main thread only: message id to the side chat branched from it. */
  sideChatByMessage: Map<string, string>;
  startSideChat: (message: ChatMessage) => Promise<void>;
  actions: MessageActions;
  regenerate: (assistantId: string) => Promise<void>;
  keepModel: (threadId: string, target: FallbackTarget) => Promise<void>;
}) {
  const { saveCodeAsNote, sendToTask, sendToNote } = actions;
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the view pinned to the latest message while streaming.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, stream?.text, stream?.reasoning]);

  return (
    <ScrollArea className="flex-1">
      <div
        className={cn(
          "mx-auto max-w-3xl px-5 py-5",
          density === "compact" ? "space-y-2.5" : "space-y-5",
        )}
      >
        {messages.length === 0 && (
          <Suggestions
            mode={mode}
            onPick={(s) => {
              setInput(s);
            }}
          />
        )}
        {messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            live={stream?.id === m.id ? stream : null}
            showTimestamps={showTimestamps}
            busy={Boolean(stream)}
            onCopy={() => navigator.clipboard.writeText(m.content)}
            onDelete={() => chatMessagesRepo.remove(m.id)}
            onRegenerate={() => void regenerate(m.id)}
            onSaveCodeAsNote={saveCodeAsNote}
            onCreateTask={() => void sendToTask(m.content)}
            onCreateNote={() => void sendToNote(m.content)}
            onKeepModel={(tid, target) => void keepModel(tid, target)}
            toolView={toolView}
            sideChatId={sideChatByMessage.get(m.id) ?? null}
            onStartSideChat={isSide ? undefined : () => void startSideChat(m)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
