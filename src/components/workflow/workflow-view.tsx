"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Workflow,
  Plug,
  Plus,
  Play,
  Square,
  ChevronDown,
  Search,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  Circle,
} from "lucide-react";
import {
  workflowRepo,
  aiConnectionsRepo,
} from "@/lib/db/repos";
import type { WorkflowRun, WorkflowStep } from "@/lib/db/schema";
import {
  WORKFLOW_STEPS,
  buildStepPrompt,
  stepSystemPrompt,
  type PriorOutput,
} from "@/lib/ai/workflow";
import {
  fetchCatalog,
  defaultModelId,
  searchModels,
  modelSupportsTools,
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

const stepDef = (key: string) => WORKFLOW_STEPS.find((s) => s.key === key);

export function WorkflowView() {
  const projectId = useActiveProjectId();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [connDialog, setConnDialog] = useState(false);

  useEffect(() => {
    fetchCatalog().then(setCatalog);
  }, []);

  const connectionsRaw = useLiveQuery(() => aiConnectionsRepo.list(), []);
  const connections = useMemo(() => connectionsRaw ?? [], [connectionsRaw]);
  const runsRaw = useLiveQuery(() => workflowRepo.listRuns(projectId), [projectId]);
  const runs = useMemo(() => runsRaw ?? [], [runsRaw]);

  const selected = runs.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      {/* Runs sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => {
              setCreating(true);
              setSelectedId(null);
            }}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" /> New workflow
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
          {runs.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No workflows yet.
            </p>
          ) : (
            runs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSelectedId(r.id);
                  setCreating(false);
                }}
                className={cn(
                  "group mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                  r.id === selectedId && !creating
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Workflow className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="flex-1 truncate">{r.title}</span>
                <Trash2
                  className="h-3.5 w-3.5 shrink-0 opacity-0 hover:text-destructive group-hover:opacity-60"
                  onClick={(e) => {
                    e.stopPropagation();
                    workflowRepo.remove(r.id);
                    if (r.id === selectedId) setSelectedId(null);
                  }}
                />
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Detail */}
      <div className="min-w-0 flex-1">
        {creating ? (
          <NewRun
            catalog={catalog}
            connections={connections}
            projectId={projectId}
            onManageConnections={() => setConnDialog(true)}
            onCreated={(id) => {
              setSelectedId(id);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : selected ? (
          <RunDetail key={selected.id} run={selected} catalog={catalog} connections={connections} onManageConnections={() => setConnDialog(true)} />
        ) : (
          <EmptyState
            icon={Workflow}
            title="16-step idea → implementation"
            description="Describe an idea and let the agent roster take it from clarification through design, implementation, tests, docs, and rollout — one reviewable step at a time."
            action={
              <Button onClick={() => setCreating(true)} disabled={!projectId}>
                <Plus className="h-4 w-4" /> New workflow
              </Button>
            }
          />
        )}
      </div>

      {connDialog && catalog && (
        <ConnectionsDialog catalog={catalog} onClose={() => setConnDialog(false)} />
      )}
    </div>
  );
}

interface ConnLike {
  id: string;
  label: string;
  providerId: string;
  apiKey: string;
  baseUrl: string;
}

function NewRun({
  catalog,
  connections,
  projectId,
  onManageConnections,
  onCreated,
  onCancel,
}: {
  catalog: Catalog | null;
  connections: ConnLike[];
  projectId: string | null | undefined;
  onManageConnections: () => void;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [idea, setIdea] = useState("");
  const [connId, setConnId] = useState(connections[0]?.id ?? "");
  const connection = connections.find((c) => c.id === connId) ?? connections[0] ?? null;
  const provider = (catalog && connection && catalog[connection.providerId]) || null;
  const [model, setModel] = useState("");
  const effModel =
    provider && !provider.models[model] ? defaultModelId(provider) : model;

  async function start() {
    if (!projectId || !connection) return;
    const run = await workflowRepo.createRun({
      projectId,
      connectionId: connection.id,
      modelId: effModel,
      idea: idea.trim(),
      title: idea.trim().slice(0, 48) + (idea.trim().length > 48 ? "…" : "") || "Untitled workflow",
    });
    onCreated(run.id);
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-4 px-6">
      <div>
        <h2 className="text-lg font-semibold">New workflow</h2>
        <p className="text-sm text-muted-foreground">
          Describe the idea you want taken from concept to implementation.
        </p>
      </div>
      <Textarea
        autoFocus
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="e.g. A spaced-repetition flashcard feature inside the Brain module…"
        rows={4}
        className="text-sm"
      />
      {connections.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Connect an AI provider first.
          <div className="mt-2">
            <Button size="sm" onClick={onManageConnections}>
              <Plug className="h-4 w-4" /> Add connection
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <ConnMenu connections={connections} value={connection} onChange={(c) => setConnId(c.id)} onManage={onManageConnections} />
          {provider && <ModelMenu provider={provider} value={effModel} onChange={setModel} />}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!idea.trim() || !connection} onClick={start}>
          <Play className="h-3.5 w-3.5" /> Start workflow
        </Button>
      </div>
    </div>
  );
}

function RunDetail({
  run,
  catalog,
  connections,
  onManageConnections,
}: {
  run: WorkflowRun;
  catalog: Catalog | null;
  connections: ConnLike[];
  onManageConnections: () => void;
}) {
  const autoAdvance = usePageSettings((s) => s.workflow.autoAdvance);
  const steps = useLiveQuery(() => workflowRepo.listSteps(run.id), [run.id]) ?? [];
  const [active, setActive] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const connection =
    connections.find((c) => c.id === run.connectionId) ?? connections[0] ?? null;
  const provider: AiProvider | null =
    (catalog && connection && catalog[connection.providerId]) || null;

  async function runStep(step: WorkflowStep, prior: PriorOutput[]): Promise<string> {
    if (!connection || !provider) throw new Error("No connection");
    if (!connection.apiKey && !provider.noAuth) {
      onManageConnections();
      throw new Error("Missing API key");
    }
    const def = stepDef(step.stepKey)!;
    await workflowRepo.updateStep(step.id, { status: "running", output: "" });
    setActive({ id: step.id, text: "" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Ground the step's agent in the live workspace; materializing steps
      // also get the tool belt so their artifacts (specs, tasks, docs,
      // memories) are created for real — but only when the model can call
      // tools at all.
      const withTools =
        Boolean(def.materialize) && modelSupportsTools(provider, run.modelId);
      const contextText = await assembleWorkspaceContext(run.projectId, {
        query: `${run.idea} ${def.title}`,
      });
      const system = buildAssistantSystemPrompt(contextText, {
        withTools,
        role: `${stepSystemPrompt(def)}\n\nYou are executing step "${def.title}" of MasarFlow's 16-step idea→implementation workflow.`,
      });

      let acc = "";
      const result = await runWorkspaceChat({
        provider,
        apiKey: connection.apiKey,
        baseUrl: connection.baseUrl,
        model: run.modelId,
        system,
        messages: [
          {
            role: "user",
            // Skip the "persist via tools" instruction when tools are off.
            content: buildStepPrompt(
              run.idea,
              prior,
              withTools ? def : { ...def, materialize: undefined },
            ),
          },
        ],
        tools: withTools ? WORKSPACE_TOOLS : undefined,
        executeTool: withTools
          ? (call) => executeWorkspaceTool(run.projectId, call)
          : undefined,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === "text") {
            acc += e.text;
            setActive({ id: step.id, text: acc });
          } else if (e.type === "round" && e.round > 0 && acc) {
            acc += "\n\n";
          }
        },
      });
      const output = result.text || acc;
      // A step with no text and no executed tools produced nothing usable —
      // mark it as an error so the pipeline stops instead of feeding empty
      // context to later steps.
      if (!output.trim() && result.executed.length === 0) {
        throw new Error(
          "The model returned an empty response — rerun this step, or try another model.",
        );
      }
      await workflowRepo.updateStep(step.id, { status: "done", output });
      return output;
    } catch (e) {
      const msg = controller.signal.aborted ? "Stopped." : (e as Error).message;
      await workflowRepo.updateStep(step.id, { status: "error", output: msg });
      throw e;
    } finally {
      setActive(null);
      abortRef.current = null;
    }
  }

  function priorOutputs(upto: number, list: WorkflowStep[]): PriorOutput[] {
    return list
      .filter((s) => s.order < upto && s.status === "done")
      .map((s) => ({ title: stepDef(s.stepKey)?.title ?? s.stepKey, output: s.output }));
  }

  async function runOne(step: WorkflowStep) {
    if (busy) return;
    setBusy(true);
    try {
      if (autoAdvance) {
        // Run this step and continue through the remaining steps in order.
        const all = await workflowRepo.listSteps(run.id);
        const prior = priorOutputs(step.order, all);
        for (const s of all.filter((x) => x.order >= step.order)) {
          if (s.status === "done" && s.id !== step.id) {
            prior.push({
              title: stepDef(s.stepKey)?.title ?? s.stepKey,
              output: s.output,
            });
            continue;
          }
          try {
            const out = await runStep(s, [...prior]);
            prior.push({
              title: stepDef(s.stepKey)?.title ?? s.stepKey,
              output: out,
            });
          } catch {
            break; // stop the chain on first failure / stop
          }
        }
      } else {
        await runStep(step, priorOutputs(step.order, steps));
      }
    } catch {
      /* surfaced on the step */
    } finally {
      setBusy(false);
    }
  }

  async function runAll() {
    if (busy) return;
    setBusy(true);
    try {
      const all = await workflowRepo.listSteps(run.id);
      const prior: PriorOutput[] = [];
      for (const s of all) {
        const def = stepDef(s.stepKey)!;
        if (s.status === "done") {
          prior.push({ title: def.title, output: s.output });
          continue;
        }
        try {
          const out = await runStep(s, [...prior]);
          prior.push({ title: def.title, output: out });
        } catch {
          break; // stop the pipeline on the first failure / stop
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Workflow className="h-4 w-4 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {run.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {doneCount}/{steps.length}
          </span>
          {busy ? (
            <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={runAll} disabled={!connection}>
              <Play className="h-3.5 w-3.5" /> Run all
            </Button>
          )}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{run.idea}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ConnMenu
            connections={connections}
            value={connection}
            onChange={(c) => {
              const prov = catalog?.[c.providerId];
              workflowRepo.updateRun(run.id, {
                connectionId: c.id,
                modelId: prov ? defaultModelId(prov) : "",
              });
            }}
            onManage={onManageConnections}
          />
          {provider && (
            <ModelMenu
              provider={provider}
              value={run.modelId}
              onChange={(m) => workflowRepo.updateRun(run.id, { modelId: m })}
            />
          )}
        </div>
      </div>

      {/* Steps */}
      <ScrollArea className="flex-1">
        <ol className="mx-auto max-w-3xl space-y-2 px-5 py-5">
          {steps.map((s) => {
            const def = stepDef(s.stepKey);
            const live = active && active.id === s.id;
            const out = live ? active.text : s.output;
            const status = live ? "running" : s.status;
            return (
              <li key={s.id} className="rounded-lg border border-border">
                <div className="flex items-center gap-3 px-3 py-2">
                  <StatusIcon status={status} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {String(s.order + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {def?.title ?? s.stepKey}
                  </span>
                  {def && (
                    <Badge variant="outline" className="capitalize">
                      {def.role}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => runOne(s)}
                    disabled={busy || !connection}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {s.status === "done" ? "Rerun" : "Run"}
                  </Button>
                </div>
                {(out || live) && (
                  <div className="border-t border-border px-4 py-3">
                    {status === "error" ? (
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
                )}
              </li>
            );
          })}
        </ol>
      </ScrollArea>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-node-idea" />;
  if (status === "done")
    return <Check className="h-4 w-4 shrink-0 text-node-lore" />;
  if (status === "error")
    return <AlertCircle className="h-4 w-4 shrink-0 text-node-decision" />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />;
}

// ── Shared inline pickers (mirror Chat / Agents) ─────────────────────────────

function ConnMenu({
  connections,
  value,
  onChange,
  onManage,
}: {
  connections: ConnLike[];
  value: ConnLike | null;
  onChange: (c: ConnLike) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-40 truncate">{value?.label ?? "No connection"}</span>
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
