"use client";

import { useMemo, useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
  ImageIcon,
  Plug,
  Search,
  Settings2,
  Wrench,
  WrenchOff,
} from "lucide-react";
import type { AiConnection } from "@/lib/db/schema";
import {
  modelsForProvider,
  modelSupportsImages,
  modelSupportsReasoning,
  modelSupportsTools,
  type AiModel,
  type Catalog,
} from "@/lib/ai/catalog";
import { providerForConnection } from "@/lib/ai/chat-backends";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils/cn";

/** One pickable row: a model of a saved connection, with its capability flags. */
export interface ModelPickerEntry {
  connectionId: string;
  connectionLabel: string;
  providerId: string;
  providerName: string;
  model: AiModel;
  tools: boolean;
  images: boolean;
  reasoning: boolean;
}

/** Flatten saved connections × their provider's models into pickable rows. */
export function modelPickerEntries(
  connections: AiConnection[],
  catalog: Catalog | null,
): ModelPickerEntry[] {
  if (!catalog) return [];
  const out: ModelPickerEntry[] = [];
  for (const c of connections) {
    const provider = providerForConnection(catalog, c);
    if (!provider) continue;
    for (const model of modelsForProvider(provider)) {
      out.push({
        connectionId: c.id,
        connectionLabel: c.label,
        providerId: provider.id,
        providerName: provider.name,
        model,
        tools: modelSupportsTools(provider, model.id),
        images: modelSupportsImages(provider, model.id),
        reasoning: modelSupportsReasoning(provider, model.id),
      });
    }
  }
  return out;
}

/** Filter rows by free text (model name/id or connection label) + connection. */
export function filterModelPickerEntries(
  entries: ModelPickerEntry[],
  opts: { query?: string; connectionId?: string | null } = {},
): ModelPickerEntry[] {
  const q = (opts.query ?? "").trim().toLowerCase();
  return entries.filter((e) => {
    if (opts.connectionId && e.connectionId !== opts.connectionId) return false;
    if (!q) return true;
    return (
      e.model.name.toLowerCase().includes(q) ||
      e.model.id.toLowerCase().includes(q) ||
      e.connectionLabel.toLowerCase().includes(q)
    );
  });
}

/** The thread patch a selected row produces. */
export function selectionOf(entry: ModelPickerEntry): {
  connectionId: string;
  modelId: string;
  providerId: string;
} {
  return {
    connectionId: entry.connectionId,
    modelId: entry.model.id,
    providerId: entry.providerId,
  };
}

/**
 * One searchable connection → model picker for every saved connection. Each
 * row carries the model's capability badges; picking repoints the thread.
 */
export function UnifiedModelPicker({
  connections,
  catalog,
  connectionId,
  modelId,
  open,
  onOpenChange,
  onSelect,
  onManageConnections,
}: {
  connections: AiConnection[];
  catalog: Catalog | null;
  connectionId: string;
  modelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (choice: {
    connectionId: string;
    modelId: string;
    providerId: string;
  }) => void;
  onManageConnections: () => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string | null>(null);

  const entries = useMemo(
    () => modelPickerEntries(connections, catalog),
    [connections, catalog],
  );
  const results = useMemo(
    () =>
      filterModelPickerEntries(entries, { query, connectionId: scope }).slice(
        0,
        120,
      ),
    [entries, query, scope],
  );
  const current = entries.find(
    (e) => e.connectionId === connectionId && e.model.id === modelId,
  );

  return (
    <div className="relative shrink-0">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onOpenChange(!open)}
        data-testid="model-picker-trigger"
        title={
          current
            ? `${current.connectionLabel} · ${current.model.name}`
            : "Pick a connection and model"
        }
      >
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-44 truncate">
          {current?.model.name ?? (modelId || "Model")}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-96 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="relative border-b border-border p-1.5">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models across your connections…"
              className="h-8 pl-8 text-sm"
            />
          </div>
          {connections.length > 1 && (
            <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5">
              <button
                type="button"
                onClick={() => setScope(null)}
                className={cn(
                  "rounded border border-border px-1.5 py-0.5 text-[11px]",
                  !scope && "border-primary bg-primary/10",
                )}
              >
                All connections
              </button>
              {connections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setScope(c.id)}
                  className={cn(
                    "max-w-32 truncate rounded border border-border px-1.5 py-0.5 text-[11px]",
                    scope === c.id && "border-primary bg-primary/10",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <ScrollArea className="max-h-72">
            <ul className="p-1">
              {results.map((e) => (
                <li key={`${e.connectionId}:${e.model.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(selectionOf(e));
                      onOpenChange(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                      e.connectionId === connectionId &&
                        e.model.id === modelId &&
                        "bg-accent/60",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.model.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {e.connectionLabel}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {e.tools ? (
                        <span title="Supports tools — full agentic mode">
                          <Wrench className="h-3 w-3 text-muted-foreground" />
                        </span>
                      ) : (
                        <span title="No tool support — agentic mode can't act on your workspace with this model">
                          <WrenchOff className="h-3 w-3 text-destructive/70" />
                        </span>
                      )}
                      {e.images && (
                        <span title="Accepts images">
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                      {e.reasoning && (
                        <span title="Supports extended thinking">
                          <BrainCircuit className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                  {connections.length === 0
                    ? "No connections saved yet."
                    : "No models match."}
                </li>
              )}
            </ul>
          </ScrollArea>
          <button
            type="button"
            onClick={onManageConnections}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="h-3 w-3" /> Manage connections…
          </button>
        </div>
      )}
    </div>
  );
}
