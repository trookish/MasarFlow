"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plug,
  Plus,
  Trash2,
  Send,
  Square,
  ChevronDown,
  Search,
  MessageSquare,
  Bot,
  User,
  AlertCircle,
  Wrench,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import {
  aiConnectionsRepo,
  chatThreadsRepo,
  chatMessagesRepo,
} from "@/lib/db/repos";
import type { AiConnection, ToolActivity } from "@/lib/db/schema";
import {
  fetchCatalog,
  modelsForProvider,
  searchModels,
  type Catalog,
  type AiProvider,
} from "@/lib/ai/catalog";
import { runWorkspaceChat, type WireMessage } from "@/lib/ai/chat-client";
import { WORKSPACE_TOOLS, executeWorkspaceTool } from "@/lib/ai/tools";
import {
  assembleWorkspaceContext,
  buildAssistantSystemPrompt,
} from "@/lib/ai/context";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkdownPreview } from "@/components/brain/markdown-preview";
import { ConnectionsDialog } from "./connections-dialog";

export function ChatView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("thread");
  const { density, showTimestamps } = usePageSettings((s) => s.chat);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [connDialog, setConnDialog] = useState(false);
  const [input, setInput] = useState("");
  const [stream, setStream] = useState<{
    id: string;
    text: string;
    tools: ToolActivity[];
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchCatalog().then(setCatalog);
  }, []);

  const connections = useLiveQuery(() => aiConnectionsRepo.list(), []) ?? [];
  const threads =
    useLiveQuery(() => chatThreadsRepo.listByProject(projectId), [projectId]) ??
    [];
  const messages =
    useLiveQuery(() => chatMessagesRepo.listByThread(threadId), [threadId]) ?? [];

  const thread = threads.find((t) => t.id === threadId) ?? null;
  const connection =
    connections.find((c) => c.id === thread?.connectionId) ?? null;
  const provider: AiProvider | null =
    (catalog && connection && catalog[connection.providerId]) || null;

  function select(id: string | null) {
    router.replace(id ? `/chat?thread=${id}` : "/chat", { scroll: false });
  }

  async function newChat() {
    if (!projectId) return;
    if (connections.length === 0) {
      setConnDialog(true);
      return;
    }
    const conn = connections[0];
    const prov = catalog?.[conn.providerId];
    const firstModel = prov ? modelsForProvider(prov)[0]?.id : "";
    const t = await chatThreadsRepo.create({
      projectId,
      connectionId: conn.id,
      modelId: firstModel ?? "",
    });
    select(t.id);
  }

  async function deleteThread(id: string) {
    await chatThreadsRepo.remove(id);
    if (id === threadId) select(null);
  }

  async function send() {
    if (!thread || !connection || !provider || stream) return;
    const text = input.trim();
    if (!text) return;
    if (!connection.apiKey) {
      setConnDialog(true);
      return;
    }
    setInput("");

    // Persist the user's turn and set the title from the first message.
    await chatMessagesRepo.create({ threadId: thread.id, role: "user", content: text });
    if (thread.title === "New chat") {
      await chatThreadsRepo.update(thread.id, {
        title: text.slice(0, 48) + (text.length > 48 ? "…" : ""),
      });
    } else {
      await chatThreadsRepo.update(thread.id, {});
    }

    const history: WireMessage[] = [
      ...messages
        .filter((m) => m.role !== "system" && !m.error)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: text },
    ];

    const assistant = await chatMessagesRepo.create({
      threadId: thread.id,
      role: "assistant",
      content: "",
    });
    setStream({ id: assistant.id, text: "", tools: [] });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Ground the model in the live workspace: notes, specs, tasks, docs,
      // standards, systems, memories, dev logs — assembled fresh per turn.
      const contextText = await assembleWorkspaceContext(projectId!, {
        query: text,
      });
      const system = buildAssistantSystemPrompt(contextText, { withTools: true });

      let acc = "";
      const tools: ToolActivity[] = [];
      const toolIndexById = new Map<string, number>();
      const summarize = (args: Record<string, unknown>): string => {
        for (const k of ["title", "name", "number", "query", "content", "id"]) {
          const v = args[k];
          if (typeof v === "string" && v.trim()) return v.slice(0, 80);
        }
        return "";
      };

      const result = await runWorkspaceChat({
        provider,
        apiKey: connection.apiKey,
        baseUrl: connection.baseUrl,
        model: thread.modelId,
        system,
        messages: history,
        tools: WORKSPACE_TOOLS,
        executeTool: (call) => executeWorkspaceTool(projectId!, call),
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === "text") {
            acc += e.text;
          } else if (e.type === "round" && e.round > 0 && acc) {
            acc += "\n\n";
          } else if (e.type === "tool_call") {
            toolIndexById.set(e.id, tools.length);
            tools.push({ name: e.name, summary: summarize(e.arguments), ok: true });
          } else if (e.type === "tool_result") {
            const i = toolIndexById.get(e.id);
            if (i !== undefined) tools[i] = { ...tools[i], ok: e.ok };
          }
          setStream({ id: assistant.id, text: acc, tools: [...tools] });
        },
      });
      await chatMessagesRepo.update(assistant.id, {
        content: result.text || acc,
        toolActivity: tools,
      });
    } catch (e) {
      const message =
        controller.signal.aborted ? "Stopped." : (e as Error).message;
      await chatMessagesRepo.update(assistant.id, { error: message });
    } finally {
      setStream(null);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Threads sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Button size="sm" className="flex-1" onClick={newChat} disabled={!projectId}>
            <Plus className="h-4 w-4" /> New chat
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="AI connections"
            onClick={() => setConnDialog(true)}
          >
            <Plug className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-2">
          {threads.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No chats yet.
            </p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => select(t.id)}
                className={cn(
                  "group mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                  t.id === threadId
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="flex-1 truncate">{t.title}</span>
                <Trash2
                  className="h-3.5 w-3.5 shrink-0 opacity-0 hover:text-destructive group-hover:opacity-60"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteThread(t.id);
                  }}
                />
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!thread ? (
          <EmptyState
            icon={MessageSquare}
            title={connections.length === 0 ? "Connect a provider" : "Start a chat"}
            description={
              connections.length === 0
                ? "Add an AI provider (Claude, OpenAI, OpenRouter, Groq, and more) with your API key to begin. Keys stay in your browser."
                : "Create a new chat and pick any model from the connected provider."
            }
            action={
              <Button onClick={newChat} disabled={!projectId}>
                <Plus className="h-4 w-4" />{" "}
                {connections.length === 0 ? "Add connection" : "New chat"}
              </Button>
            }
          />
        ) : (
          <>
            {/* Header: connection + model pickers */}
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
              <ConnectionMenu
                connections={connections}
                value={connection}
                onChange={(c) => {
                  const prov = catalog?.[c.providerId];
                  chatThreadsRepo.update(thread.id, {
                    connectionId: c.id,
                    modelId: prov ? (modelsForProvider(prov)[0]?.id ?? "") : "",
                  });
                }}
                onManage={() => setConnDialog(true)}
              />
              {provider && (
                <ModelMenu
                  provider={provider}
                  value={thread.modelId}
                  onChange={(m) => chatThreadsRepo.update(thread.id, { modelId: m })}
                />
              )}
              <span
                className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                title="Every turn is grounded in your live workspace (notes, specs, tasks, docs, standards, systems, memories) and the assistant can create or update entities via tools."
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Workspace-aware
              </span>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1">
              <div
                className={cn(
                  "mx-auto max-w-3xl px-5 py-5",
                  density === "compact" ? "space-y-2.5" : "space-y-5",
                )}
              >
                {messages.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Send a message to start the conversation.
                  </p>
                )}
                {messages.map((m) => {
                  const live = stream && stream.id === m.id;
                  const content = live ? stream.text : m.content;
                  const toolActivity = live
                    ? stream.tools
                    : (m.toolActivity ?? []);
                  return (
                    <div key={m.id} className="flex gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          m.role === "user"
                            ? "bg-accent text-foreground"
                            : "bg-primary/15 text-primary",
                        )}
                      >
                        {m.role === "user" ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        {showTimestamps && (
                          <div className="mb-0.5 text-[10px] text-muted-foreground">
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                        {toolActivity.length > 0 && (
                          <div className="mb-1.5 flex flex-wrap gap-1">
                            {toolActivity.map((t, i) => (
                              <span
                                key={`${t.name}-${i}`}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border border-border bg-accent/40 px-2 py-0.5 text-[11px]",
                                  t.ok
                                    ? "text-muted-foreground"
                                    : "text-destructive",
                                )}
                                title={t.summary}
                              >
                                <Wrench className="h-3 w-3" />
                                {t.name}
                                {t.summary && (
                                  <span className="max-w-36 truncate opacity-70">
                                    {t.summary}
                                  </span>
                                )}
                                {t.ok ? (
                                  <Check className="h-3 w-3 text-node-lore" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                        {m.error ? (
                          <div className="flex items-center gap-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {m.error}
                          </div>
                        ) : m.role === "assistant" && content && !live ? (
                          <MarkdownPreview content={content} />
                        ) : (
                          <div className="text-sm whitespace-pre-wrap">
                            {content}
                            {live && (
                              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-text-bottom" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Composer */}
            <div className="shrink-0 border-t border-border p-3">
              <div className="mx-auto flex max-w-3xl items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={
                    connection?.apiKey
                      ? "Message… (Enter to send, Shift+Enter for newline)"
                      : "Add an API key for this connection to send."
                  }
                  rows={1}
                  className="max-h-40 min-h-[40px] flex-1 resize-none text-sm"
                />
                {stream ? (
                  <Button variant="outline" size="icon" aria-label="Stop" onClick={stop}>
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    aria-label="Send"
                    onClick={() => void send()}
                    disabled={!input.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {connDialog && catalog && (
        <ConnectionsDialog catalog={catalog} onClose={() => setConnDialog(false)} />
      )}
    </div>
  );
}

function ConnectionMenu({
  connections,
  value,
  onChange,
  onManage,
}: {
  connections: AiConnection[];
  value: AiConnection | null;
  onChange: (c: AiConnection) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-40 truncate">{value?.label ?? "Connection"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <ul className="p-1">
            {connections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full truncate rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                    c.id === value?.id && "bg-accent/60",
                  )}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              onManage();
              setOpen(false);
            }}
            className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
          >
            Manage connections…
          </button>
        </div>
      )}
    </div>
  );
}

function ModelMenu({
  provider,
  value,
  onChange,
}: {
  provider: AiProvider;
  value: string;
  onChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchModels(provider, query),
    [provider, query],
  );
  const current = provider.models[value]?.name ?? value ?? "Select model";

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <span className="max-w-56 truncate">{current}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="relative border-b border-border p-1.5">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <ScrollArea className="max-h-64">
            <ul className="p-1">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "w-full truncate rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                      m.id === value && "bg-accent/60",
                    )}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                  No models found.
                </li>
              )}
            </ul>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
