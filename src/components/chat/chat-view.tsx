"use client";

import { useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelLeftOpen } from "lucide-react";
import { ConnectionsDialog } from "./connections-dialog";
import { LinkedProjectsDialog } from "./linked-projects-dialog";
import { useToolView } from "@/lib/chat/tool-view-store";
import { usePageSettings } from "@/lib/stores/page-settings";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { SideChatBanner } from "./side-chat-banner";
import { ThreadList } from "./thread-list";
import { Transcript } from "./transcript";
import { useChatThread } from "./use-chat-thread";
import { useComposer } from "./use-composer";
import { useMessageActions } from "./use-message-actions";
import { useSendTurn } from "./use-send-turn";

/**
 * The Chat surface: thread list, controls row, transcript and composer. The
 * state lives in `useChatThread` (which thread, which backend), `useComposer`
 * (the draft) and `useSendTurn` (one assistant turn at a time); this file only
 * composes them.
 */
export function ChatView() {
  const { density, showTimestamps } = usePageSettings((s) => s.chat);
  const toolView = useToolView((s) => s.mode);
  const setToolView = useToolView((s) => s.setMode);

  const [threadsOpen, setThreadsOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [linkDialog, setLinkDialog] = useState(false);
  const [connDialog, setConnDialog] = useState(false);

  const t = useChatThread({ setThreadsOpen, setConnDialog, setSendError });
  const composer = useComposer({ canUseImages: t.canUseImages });
  const actions = useMessageActions(t.projectId);
  const turn = useSendTurn({
    thread: t.thread,
    threadId: t.threadId,
    catalog: t.catalog,
    connections: t.connections,
    linkedRoots: t.linkedRoots,
    messages: t.messages,
    contextMessages: t.contextMessages,
    projectId: t.projectId,
    backend: t.backend,
    mode: t.mode,
    apiConnection: t.apiConnection,
    apiProvider: t.apiProvider,
    composer,
    setSendError,
    setModelPickerOpen,
    setConnDialog,
  });

  return (
    <div className="@container relative flex h-full min-h-0">
      <ThreadList
        threads={t.threads}
        visibleThreads={t.visibleThreads}
        threadQuery={t.threadQuery}
        setThreadQuery={t.setThreadQuery}
        threadId={t.threadId}
        projectId={t.projectId}
        threadsOpen={threadsOpen}
        setThreadsOpen={setThreadsOpen}
        select={t.select}
        deleteThread={t.deleteThread}
        newChat={t.newChat}
      />

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Narrow-only toolbar: brings the conversation list back as an
            overlay. */}
        <div className="@max-[600px]:flex @min-[600px]:hidden h-9 shrink-0 items-center gap-2 border-b border-border px-2">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Show conversations"
            title="Show conversations"
            onClick={() => setThreadsOpen(true)}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <span className="truncate text-sm font-medium">
            {t.thread?.title ?? "Conversations"}
          </span>
        </div>
        {!t.thread ? (
          <EmptyState
            icon={MessageSquare}
            title={
              t.connections.length === 0
                ? "Add your first AI connection"
                : "Start a chat"
            }
            description={
              t.connections.length === 0
                ? "MasarFlow chats over API providers you configure (keys stay in your browser) or a local Ollama server. Add a connection to get started."
                : "Pick a backend from the header (API · Local Ollama) and a model, then send a message. API keys you add live in your browser only."
            }
            action={
              t.connections.length === 0 ? (
                <Button
                  onClick={() => setConnDialog(true)}
                  disabled={!t.projectId}
                >
                  <Plus className="h-4 w-4" /> Add connection
                </Button>
              ) : (
                <Button
                  onClick={() => void t.newChat()}
                  disabled={!t.projectId}
                >
                  <Plus className="h-4 w-4" /> New chat
                </Button>
              )
            }
          />
        ) : (
          <>
            <ChatHeader
              thread={t.thread}
              backend={t.backend}
              mode={t.mode}
              connections={t.connections}
              catalog={t.catalog}
              apiConnection={t.apiConnection}
              ollamaProvider={t.ollamaProvider}
              activeCanReason={t.activeCanReason}
              linkedRoots={t.linkedRoots}
              modelPickerOpen={modelPickerOpen}
              setModelPickerOpen={setModelPickerOpen}
              setConnDialog={setConnDialog}
              setLinkDialog={setLinkDialog}
              switchBackend={t.switchBackend}
              toolView={toolView}
              onToolViewChange={setToolView}
            />
            {t.isSide && (
              <SideChatBanner
                mainTitle={t.mainThread?.title ?? null}
                sharedCount={t.sharedCount}
                onReturn={t.returnToMain}
                onDiscard={() => void t.discardSideChat()}
              />
            )}
            <Transcript
              messages={t.messages}
              mode={t.mode}
              density={density}
              showTimestamps={showTimestamps}
              stream={turn.stream}
              setInput={composer.setInput}
              toolView={toolView}
              isSide={t.isSide}
              sideChatByMessage={t.sideChatByMessage}
              startSideChat={t.startSideChat}
              actions={actions}
              regenerate={turn.regenerate}
              keepModel={turn.keepModel}
            />
            <Composer
              composer={composer}
              legacyApproval={turn.legacyApproval}
              setLegacyApproval={turn.setLegacyApproval}
              sendError={sendError}
              inlineNotice={turn.inlineNotice}
              stream={turn.stream}
              mode={t.mode}
              canUseImages={t.canUseImages}
              projectId={t.projectId}
              send={turn.send}
              stop={turn.stop}
            />
          </>
        )}
      </div>

      {linkDialog && t.projectId && (
        <LinkedProjectsDialog
          projectId={t.projectId}
          roots={t.linkedRoots ?? []}
          onClose={() => setLinkDialog(false)}
        />
      )}
      {connDialog && (
        <ConnectionsDialog
          catalog={t.catalog ?? {}}
          onClose={() => setConnDialog(false)}
        />
      )}
    </div>
  );
}
