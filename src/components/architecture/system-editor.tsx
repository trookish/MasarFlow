"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2, Check, Network } from "lucide-react";
import { systemsRepo } from "@/lib/db/repos";
import type { System } from "@/lib/db/schema";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const STATUSES: System["status"][] = ["planned", "active", "deprecated"];

/** Suggested categories — the field is free-form, these just seed the picker. */
const CATEGORIES = [
  "core",
  "module",
  "ai",
  "input",
  "rendering",
  "networking",
  "audio",
  "ui",
  "tooling",
];

type SystemForm = Pick<
  System,
  "name" | "description" | "category" | "status" | "health" | "dependencies"
>;

function toForm(s: System): SystemForm {
  return {
    name: s.name,
    description: s.description,
    category: s.category,
    status: s.status,
    health: s.health,
    dependencies: s.dependencies,
  };
}

export function SystemEditor({
  system,
  allSystems,
  onDelete,
}: {
  system: System;
  allSystems: System[];
  onDelete: () => void;
}) {
  const systemId = system.id;
  const [form, setForm] = useState<SystemForm>(() => toForm(system));
  const savedJson = useRef(JSON.stringify(form));
  const latest = useRef(form);

  useEffect(() => {
    latest.current = form;
    const json = JSON.stringify(form);
    if (json === savedJson.current) return;
    const handle = setTimeout(async () => {
      await systemsRepo.update(systemId, form);
      savedJson.current = json;
    }, 450);
    return () => clearTimeout(handle);
  }, [form, systemId]);

  useEffect(() => {
    return () => {
      if (JSON.stringify(latest.current) !== savedJson.current) {
        void systemsRepo.update(systemId, latest.current);
      }
    };
  }, [systemId]);

  const set = (patch: Partial<SystemForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const others = allSystems.filter((s) => s.id !== systemId);
  const nameOf = (id: string) =>
    allSystems.find((s) => s.id === id)?.name ?? "Unknown";

  function toggleDep(id: string) {
    set({
      dependencies: form.dependencies.includes(id)
        ? form.dependencies.filter((d) => d !== id)
        : [...form.dependencies, id],
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Input
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          className="h-9 flex-1 text-base font-semibold"
          placeholder="System name"
        />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" size="sm">
              <span className="capitalize">{form.status}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                active={s === form.status}
                onSelect={() => set({ status: s })}
              >
                <span className="capitalize">{s}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete system"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Textarea
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="What this system is responsible for."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Category
              </label>
              <div className="flex items-center gap-1.5">
                <Input
                  value={form.category}
                  onChange={(e) => set({ category: e.target.value })}
                  placeholder="module"
                  className="h-8 text-sm"
                  list="system-categories"
                />
                <datalist id="system-categories">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Health ({form.health})
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={form.health}
                onChange={(e) => set({ health: Number(e.target.value) })}
                className="h-8 w-full accent-[var(--primary)]"
                aria-label="System health"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Dependencies
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="outline" size="sm" disabled={others.length === 0}>
                    <Network className="h-3.5 w-3.5" />
                    Depends on
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-72 w-60 overflow-y-auto"
                >
                  <DropdownMenuLabel>Depends on</DropdownMenuLabel>
                  {others.map((s) => {
                    const on = form.dependencies.includes(s.id);
                    return (
                      <DropdownMenuItem
                        key={s.id}
                        onSelect={() => toggleDep(s.id)}
                      >
                        <Check
                          className={cn(
                            "h-4 w-4",
                            on ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{s.name}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {form.dependencies.length === 0 ? (
              <p className="text-xs text-muted-foreground/70">
                No dependencies — this is a foundation system.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {form.dependencies.map((id) => (
                  <Badge key={id} variant="outline" className="gap-1">
                    {nameOf(id)}
                    <button
                      type="button"
                      aria-label={`Remove dependency ${nameOf(id)}`}
                      onClick={() => toggleDep(id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
