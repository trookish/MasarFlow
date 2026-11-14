"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Eraser,
  Search,
  MessageSquare,
  Pencil,
} from "lucide-react";
import { chatThreadsRepo, chatMessagesRepo } from "@/lib/db/repos";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatThread } from "@/lib/db/schema";

export function ThreadList({
  threads,
  visibleThreads,
  threadQuery,
  setThreadQuery,
  threadId,
  projectId,
  threadsOpen,
  setThreadsOpen,
  select,
  deleteThread,
  newChat,
}: {
  threads: ChatThread[];
  visibleThreads: ChatThread[];
  threadQuery: string;
  setThreadQuery: (value: string) => void;
  threadId: string | null;
  projectId: string | null;
  threadsOpen: boolean;
  setThreadsOpen: (open: boolean) => void;
  select: (id: string | null) => void;
  deleteThread: (id: string) => Promise<void>;
  newChat: () => Promise<void>;
}) {
  return (
    <>
      {/* Narrow panels: a backdrop closes the conversation-list overlay. */}
      {threadsOpen && (
        <button
          type="button"
          aria-label="Close conversations"
          onClick={() => setThreadsOpen(false)}
          className="absolute inset-0 z-30 bg-background/60 @max-[600px]:block @min-[600px]:hidden"
        />
      )}
      {/* Threads sidebar. A fixed 256px column while the panel is wide; below
          600px it overlays the conversation (opened from the toolbar toggle),
          so the messages and composer keep a usable width. The fixed w-64
          column used to starve them to a sliver in a ~360px dock panel. */}
      <div
        className={cn(
          "w-64 shrink-0 flex-col border-r border-border",
          threadsOpen
            ? "flex @max-[600px]:absolute @max-[600px]:inset-y-0 @max-[600px]:left-0 @max-[600px]:z-40 @max-[600px]:bg-background @max-[600px]:shadow-xl"
            : "@min-[600px]:flex @max-[600px]:hidden",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => {
              setThreadsOpen(false);
              void newChat();
            }}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" /> New chat
          </Button>
        </div>
        {threads.length > 3 && (
          <div className="relative border-b border-border p-2">
            <Search className="absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={threadQuery}
              onChange={(e) => setThreadQuery(e.target.value)}
              placeholder="Search chats…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        )}
        <ScrollArea className="flex-1 p-2">
          {visibleThreads.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {threads.length === 0 ? "No chats yet." : "No matches."}
            </p>
          ) : (
            visibleThreads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === threadId}
                onSelect={() => select(t.id)}
                onDelete={() => deleteThread(t.id)}
              />
            ))
          )}
        </ScrollArea>
      </div>
    </>
  );
}

/* ── Thread row with inline rename ────────────────────────────────────── */

function ThreadRow({
  thread,
  active,
  onSelect,
  onDelete,
}: {
  thread: ChatThread;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);
  const [confirmClear, setConfirmClear] = useState(false);

  async function commit() {
    setEditing(false);
    const next = title.trim();
    if (next && next !== thread.title) {
      await chatThreadsRepo.update(thread.id, { title: next });
    } else {
      setTitle(thread.title);
    }
  }

  if (editing) {
    return (
      <div className="mb-0.5 px-1">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") {
              setTitle(thread.title);
              setEditing(false);
            }
          }}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => setEditing(true)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="flex-1 truncate">{thread.title}</span>
      </button>
      <button
        type="button"
        aria-label="Rename chat"
        onClick={() => setEditing(true)}
        className="shrink-0 opacity-0 hover:text-foreground group-hover:opacity-60"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label="Clear thread history"
        title="Clear thread history"
        onClick={() => setConfirmClear(true)}
        className="shrink-0 opacity-0 hover:text-foreground group-hover:opacity-60"
      >
        <Eraser className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label="Delete chat"
        onClick={onDelete}
        className="shrink-0 opacity-0 hover:text-destructive group-hover:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear thread history?"
        description={`Every message in "${thread.title}" is removed. The chat itself stays, and records the assistant created are not affected.`}
        confirmLabel="Clear history"
        onConfirm={() => void chatMessagesRepo.clearThread(thread.id)}
      />
    </div>
  );
}
