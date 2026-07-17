"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bot,
  Plug,
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  Search,
  Trash2,
  AlertCircle,
  Sparkles,
  BrainCircuit,
  Info,
} from "lucide-react";
import {
  agentsRepo,
  agentRunsRepo,
  agentStepsRepo,
  aiConnectionsRepo,
} from "@/lib/db/repos";
import type { Agent } from "@/lib/db/schema";
import {
  fetchCatalog,
  defaultModelId,
  searchModels,
  modelSupportsTools,
  modelSupportsReasoning,
  type Catalog,
  type AiProvider,
} from "@/lib/ai/catalog";
import { runWorkspaceChat } from "@/lib/ai/chat-client";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkdownPreview } from "@/components/brain/markdown-preview";
import { ConnectionsDialog } from "@/components/chat/connections-dialog";

export function AgentsView() {
  const projectId = useActiveProjectId();
  const { showDisabled } = usePageSettings((s) => s.agents);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connDialog, setConnDialog] = useState(false);

  useEffect(() => {
    agentsRepo.ensureSeeded();
    fetchCatalog().then(setCatalog);
  }, []);

  const agentsRaw = useLiveQuery(() => agentsRepo.list(), []);
  const connectionsRaw = useLiveQuery(() => aiConnectionsRepo.list(), []);
  const connections = useMemo(() => connectionsRaw ?? [], [connectionsRaw]);

  const sorted = useMemo(
    () =>
      [...(agentsRaw ?? [])]
        .filter((a) => showDisabled || a.enabled)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [agentsRaw, showDisabled],
  );
  const selected = sorted.find((a) => a.id === selectedId) ?? sorted[0] ?? null;

  return (
    <div className="flex h-full min-h-0">
      {/* Roster */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Agents</span>
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
          {sorted.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedId(a.id)}
              className={cn(
                "mb-1 flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left",
                a.id === selected?.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {a.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.description}
                </span>
              </span>
            </button>
          ))}
        </ScrollArea>
      </div>

      {/* Workspace */}
      <div className="min-w-0 flex-1">
        {selected ? (
          <AgentWorkspace
            key={selected.id}
            agent={selected}
            catalog={catalog}
            hasConnections={connections.length > 0}
            connections={connections}
            projectId={projectId}
            onManageConnections={() => setConnDialog(true)}
          />
        ) : (
          <EmptyState icon={Bot} title="Loading agents…" description="" />
        )}
      </div>

      {connDialog && catalog && (
        <ConnectionsDialog catalog={catalog} onClose={() => setConnDialog(false)} />
      )}
    </div>
  );
}

function AgentWorkspace({
  agent,
  catalog,
  connections,
  projectId,
  onManageConnections,
}: {
  agent: Agent;
  catalog: Catalog | null;
  hasConnections: boolean;
  connections: { id: string; label: string; providerId: string; apiKey: string; baseUrl: string }[];
  projectId: string | null | undefined;
  onManageConnections: () => void;
}) {
  const [prompt, setPrompt] = useState(agent.systemPrompt);
  const [input, setInput] = useState("");
  const [connId, setConnId] = useState(connections[0]?.id ?? "");
  const [model, setModel] = useState(agent.model);
  const [thinking, setThinking] = useState(false);
  const [active, setActive] = useState<{ id: string; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connection =
    connections.find((c) => c.id === connId) ?? connections[0] ?? null;
  const provider: AiProvider | null =
    (catalog && connection && catalog[connection.providerId]) || null;

  const runs =
    useLiveQuery(
      () => agentRunsRepo.listByAgent(projectId, agent.id),
      [projectId, agent.id],
    ) ?? [];

  // Persist system-prompt edits (debounced).
  useEffect(() => {
    if (prompt === agent.systemPrompt) return;
    const h = setTimeout(() => agentsRepo.update(agent.id, { systemPrompt: prompt }), 500);
    return () => clearTimeout(h);
  }, [prompt, agent.id, agent.systemPrompt]);

  // The effective model falls back to a chat-capable default when the stored
  // choice isn't available on the selected connection's provider.
  const effModel =
    provider && !provider.models[model]
      ? (defaultModelId(provider) || model)
      : model;

  async function run() {
    if (!projectId || !connection || !provider || active) return;
    const task = input.trim();
    if (!task) return;
    if (!connection.apiKey && !provider.noAuth) {
      onManageConnections();
      return;
    }
    setInput("");
    const record = await agentRunsRepo.create({
      projectId,
      agentId: agent.id,
      input: task,
      status: "running",
      startedAt: Date.now(),
    });
    setActive({ id: record.id, text: "" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Ground the agent in the live workspace; the tool belt is only sent
      // when the selected model can actually call tools.
      const withTools = modelSupportsTools(provider, effModel);
      const contextText = await assembleWorkspaceContext(projectId, {
        query: task,
      });
      const system = buildAssistantSystemPrompt(contextText, {
        withTools,
        role: `${prompt}\n\nYou are running inside MasarFlow as the "${agent.name}" agent (role: ${agent.role}).`,
      });

      let acc = "";
      const result = await runWorkspaceChat({
        provider,
        apiKey: connection.apiKey,
        baseUrl: connection.baseUrl,
        model: effModel,
        system,
        messages: [{ role: "user", content: task }],
        tools: withTools ? WORKSPACE_TOOLS : undefined,
        executeTool: withTools
          ? (call) => executeWorkspaceTool(projectId, call)
          : undefined,
        reasoning:
          thinking && modelSupportsReasoning(provider, effModel)
            ? { enabled: true, budget: 8000 }
            : undefined,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === "text") {
            acc += e.text;
            setActive({ id: record.id, text: acc });
          } else if (e.type === "round" && e.round > 0 && acc) {
            acc += "\n\n";
          } else if (e.type === "notice") {
            void agentStepsRepo.append(record.id, "status", e.message);
          } else if (e.type === "tool_call") {
            void agentStepsRepo.append(
              record.id,
              "action",
              JSON.stringify({ name: e.name, arguments: e.arguments }),
            );
          } else if (e.type === "tool_result") {
            void agentStepsRepo.append(
              record.id,
              "result",
              JSON.stringify({ name: e.name, ok: e.ok, content: e.content }),
            );
          }
        },
      });
      if (result.reasoning) {
        await agentStepsRepo.append(record.id, "think", result.reasoning);
      }
      const output = result.text || acc;
      const didWork = Boolean(output.trim()) || result.executed.length > 0;
      await agentRunsRepo.update(record.id, {
        output: didWork
          ? output
          : "The model returned an empty response — rerun the task, or try another model.",
        status: didWork ? "done" : "error",
        finishedAt: Date.now(),
      });
    } catch (e) {
      await agentRunsRepo.update(record.id, {
        output: controller.signal.aborted ? "Stopped." : (e as Error).message,
        status: "error",
        finishedAt: Date.now(),
      });
    } finally {
      setActive(null);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Bot className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{agent.name}</span>
            <Badge variant="outline" className="capitalize">
              {agent.role}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {agent.description}
          </p>
        </div>
        <Button
          variant={agent.enabled ? "outline" : "default"}
          size="sm"
          onClick={() => agentsRepo.update(agent.id, { enabled: !agent.enabled })}
        >
          {agent.enabled ? "Disable" : "Enable"}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-5 px-5 py-5">
          {/* Instructions */}
          <section className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Instructions (system prompt)
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="text-sm"
            />
          </section>

          {/* Run config */}
          <section className="flex flex-wrap items-center gap-2">
            <ConnMenu
              connections={connections}
              value={connection}
              onChange={(c) => setConnId(c.id)}
              onManage={onManageConnections}
            />
            {provider && (
              <ModelMenu provider={provider} value={effModel} onChange={setModel} />
            )}
            {provider && modelSupportsReasoning(provider, effModel) && (
              <Button
                variant={thinking ? "default" : "outline"}
                size="sm"
                onClick={() => setThinking((v) => !v)}
                title="Extended thinking: the model reasons before acting"
              >
                <BrainCircuit className="h-3.5 w-3.5" /> Thinking
              </Button>
            )}
            {provider && !modelSupportsTools(provider, effModel) && (
              <span className="text-[11px] text-muted-foreground">
                This model can’t call tools — the agent will advise instead of act.
              </span>
            )}
          </section>

          {/* Composer */}
          <section className="space-y-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void run();
                }
              }}
              placeholder={`Give ${agent.name} a task… (⌘/Ctrl+Enter to run)`}
              rows={3}
              className="text-sm"
            />
            <div className="flex justify-end">
              {active ? (
                <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void run()}
                  disabled={!input.trim() || !connection}
                >
                  <Play className="h-3.5 w-3.5" /> Run {agent.name}
                </Button>
              )}
            </div>
          </section>

          {/* Runs */}
          {runs.length === 0 && !active ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No runs yet. Give the agent a task to see it work.
              </p>
            </div>
          ) : (
            <section className="space-y-3">
              {runs.map((r) => {
                const live = active && active.id === r.id;
                const out = live ? active.text : r.output;
                const isError = r.status === "error";
                return (
                  <div
                    key={r.id}
                    className="rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          r.status === "running" || live
                            ? "bg-node-idea/15 text-node-idea"
                            : isError
                              ? "bg-node-decision/15 text-node-decision"
                              : "bg-node-lore/15 text-node-lore",
                        )}
                      >
                        {live ? "running" : r.status}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {r.input}
                      </span>
                      <button
                        type="button"
                        aria-label="Delete run"
                        onClick={() => agentRunsRepo.remove(r.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <RunToolSteps runId={r.id} />
                    <div className="px-4 py-3">
                      {isError ? (
                        <div className="flex items-center gap-2 text-sm text-destructive">
                          <AlertCircle className="h-4 w-4 shrink-0" /> {out}
                        </div>
                      ) : out && !live ? (
                        <MarkdownPreview content={out} />
                      ) : (
                        <div className="text-sm whitespace-pre-wrap">
                          {out}
                          {live && (
                            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-text-bottom" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/** Tool calls, notices, and thinking recorded for a run. */
function RunToolSteps({ runId }: { runId: string }) {
  const steps = useLiveQuery(() => agentStepsRepo.listByRun(runId), [runId]) ?? [];
  const actions = steps.filter((s) => s.type === "action");
  const notices = steps.filter((s) => s.type === "status");
  const thinkText = steps
    .filter((s) => s.type === "think")
    .map((s) => s.content)
    .join("\n\n");
  const resultOk = new Map<number, boolean>();
  let actionIdx = 0;
  for (const s of steps) {
    if (s.type === "action") actionIdx++;
    if (s.type === "result") {
      try {
        resultOk.set(actionIdx - 1, JSON.parse(s.content).ok !== false);
      } catch {
        /* keep unknown */
      }
    }
  }
  if (actions.length === 0 && notices.length === 0 && !thinkText) return null;
  if (actions.length === 0) {
    return (
      <div className="border-b border-border px-3 py-2">
        {notices.map((n) => (
          <p key={n.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3 w-3 shrink-0" /> {n.content}
          </p>
        ))}
        {thinkText && <AgentThinking text={thinkText} />}
      </div>
    );
  }
  return (
    <div className="space-y-1.5 border-b border-border px-3 py-2">
      {notices.map((n) => (
        <p key={n.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" /> {n.content}
        </p>
      ))}
      <div className="flex flex-wrap gap-1">
        {actions.map((s, i) => {
          let name = "tool";
          let summary = "";
          try {
            const parsed = JSON.parse(s.content) as {
              name: string;
              arguments?: Record<string, unknown>;
            };
            name = parsed.name;
            for (const k of ["title", "name", "query", "content", "id"]) {
              const v = parsed.arguments?.[k];
              if (typeof v === "string" && v.trim()) {
                summary = v.slice(0, 60);
                break;
              }
            }
          } catch {
            /* raw content */
          }
          const ok = resultOk.get(i) !== false;
          return (
            <span
              key={s.id}
              title={summary}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-border bg-accent/40 px-2 py-0.5 text-[11px]",
                ok ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {name}
              {summary && <span className="max-w-32 truncate opacity-70">{summary}</span>}
            </span>
          );
        })}
      </div>
      {thinkText && <AgentThinking text={thinkText} />}
    </div>
  );
}

/** Collapsible extended-thinking trace for a run. */
function AgentThinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <BrainCircuit className="h-3 w-3" /> Thinking
      </button>
      {open && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
}

// ── Small inline pickers (mirror the Chat module) ────────────────────────────

function ConnMenu({
  connections,
  value,
  onChange,
  onManage,
}: {
  connections: { id: string; label: string }[];
  value: { id: string; label: string } | null;
  onChange: (c: { id: string; label: string }) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-40 truncate">
          {value?.label ?? "No connection"}
        </span>
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
                  className="w-full truncate rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent"
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
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchModels(provider, query), [provider, query]);
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
                    className="w-full truncate rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent"
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
