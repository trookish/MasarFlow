"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Search,
  Wrench,
  BrainCircuit,
  ImageIcon,
} from "lucide-react";
import type { ChatBackend } from "@/lib/db/schema";
import { type AiModel } from "@/lib/ai/catalog";
import { EFFORT_LEVELS, type Effort } from "@/lib/ai/providers/effort";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ── Mode toggle ──────────────────────────────────────────────────────── */

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: "agentic" | "chat";
  onChange: (mode: "agentic" | "chat") => void;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
      {(
        [
          {
            value: "agentic",
            label: "Agentic",
            hint: "Grounded in your workspace; can create and update entities via tools.",
          },
          {
            value: "chat",
            label: "Chat",
            hint: "Direct conversation with the model — nothing from the workspace is sent.",
          },
        ] as const
      ).map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.hint}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            mode === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Reasoning effort selector (writes thread.effort) ─────────────────── */

const EFFORT_HINTS: Record<Effort, string> = {
  off: "No extended thinking — fastest answers.",
  low: "A little extended thinking.",
  medium: "Balanced extended thinking (the old default budget).",
  high: "Maximum extended thinking — slowest, most thorough.",
};

export function EffortSelector({
  effort,
  canReason,
  onChange,
}: {
  effort: Effort;
  canReason: boolean;
  onChange: (effort: Effort) => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center rounded-md border border-border p-0.5"
      title={
        canReason
          ? "Reasoning effort for this chat."
          : "This model doesn't advertise reasoning support — effort levels have no effect."
      }
    >
      <BrainCircuit className="mx-1 h-3.5 w-3.5 text-muted-foreground" />
      {EFFORT_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          title={EFFORT_HINTS[level]}
          onClick={() => onChange(level)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium capitalize transition-colors",
            effort === level
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

/* ── Backend switch (API / Local Ollama) ──────────────────────────────── */

const BACKEND_OPTIONS: {
  value: ChatBackend;
  label: string;
  hint: string;
}[] = [
  {
    value: "api",
    label: "API",
    hint: "A saved AI connection (key lives in your browser) — workspace + linked-folder tools.",
  },
  {
    value: "ollama",
    label: "Ollama",
    hint: "Local (Ollama) — your own server, no API key needed.",
  },
];

export function BackendSwitch({
  backend,
  onChange,
}: {
  backend: ChatBackend;
  onChange: (backend: ChatBackend) => void;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
      {BACKEND_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.hint}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            backend === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Catalog model picker (API / Ollama backends) ─────────────────────── */

export function CatalogModelMenu({
  models,
  value,
  offline = false,
  onChange,
}: {
  models: AiModel[];
  value: string;
  offline?: boolean;
  onChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [models, query]);
  const current = models.find((m) => m.id === value);

  if (offline) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Ollama isn't reachable — start it and reload the page."
      >
        <span className="max-w-44 truncate">Ollama offline</span>
      </Button>
    );
  }

  return (
    <div className="relative shrink-0">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <span className="max-w-44 truncate">{current?.name ?? "Model"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-80 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
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
                      "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                      m.id === value && "bg-accent/60",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {m.tool_call && (
                        <span title="Supports tools — full agentic mode">
                          <Wrench className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                      {m.attachment && (
                        <span title="Accepts images">
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                      {m.reasoning && (
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
