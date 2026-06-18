"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2, Plus, X, FileText, KanbanSquare } from "lucide-react";
import { specsRepo } from "@/lib/db/repos";
import type { Note, Spec, SpecStatus, Task } from "@/lib/db/schema";
import { SPEC_STATUSES, specStatusMeta, taskStatusLabel } from "@/lib/workflow";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { StringListEditor } from "./string-list-editor";

interface SpecEditorProps {
  spec: Spec;
  notes: Note[];
  linkedTasks: Task[];
  onDelete: () => void;
  onOpenTask: (taskId: string) => void;
  onCreateTask: () => void;
}

type SpecForm = Pick<
  Spec,
  | "number"
  | "title"
  | "status"
  | "purpose"
  | "goals"
  | "features"
  | "constraints"
  | "dependencies"
  | "acceptance"
  | "risks"
  | "futureImprovements"
  | "technicalNotes"
  | "linkedNoteIds"
>;

function toForm(spec: Spec): SpecForm {
  return {
    number: spec.number,
    title: spec.title,
    status: spec.status,
    purpose: spec.purpose,
    goals: spec.goals,
    features: spec.features,
    constraints: spec.constraints,
    dependencies: spec.dependencies,
    acceptance: spec.acceptance,
    risks: spec.risks,
    futureImprovements: spec.futureImprovements,
    technicalNotes: spec.technicalNotes,
    linkedNoteIds: spec.linkedNoteIds,
  };
}

export function SpecEditor({
  spec,
  notes,
  linkedTasks,
  onDelete,
  onOpenTask,
  onCreateTask,
}: SpecEditorProps) {
  const specId = spec.id;
  const [form, setForm] = useState<SpecForm>(() => toForm(spec));
  const savedJson = useRef(JSON.stringify(form));
  const latest = useRef(form);

  // Debounced autosave when the form differs from the last saved snapshot.
  useEffect(() => {
    latest.current = form;
    const json = JSON.stringify(form);
    if (json === savedJson.current) return;
    const handle = setTimeout(async () => {
      await specsRepo.update(specId, form);
      savedJson.current = json;
    }, 450);
    return () => clearTimeout(handle);
  }, [form, specId]);

  // Flush a pending edit on unmount (e.g. switching specs within the debounce).
  useEffect(() => {
    return () => {
      if (JSON.stringify(latest.current) !== savedJson.current) {
        void specsRepo.update(specId, latest.current);
      }
    };
  }, [specId]);

  const set = (patch: Partial<SpecForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const statusMeta = specStatusMeta(form.status);
  const doneCount = linkedTasks.filter((t) => t.status === "done").length;
  const progress = linkedTasks.length
    ? Math.round((doneCount / linkedTasks.length) * 100)
    : 0;

  const linkedNotes = form.linkedNoteIds
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is Note => Boolean(n));
  const unlinkedNotes = notes.filter(
    (n) => !form.linkedNoteIds.includes(n.id),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Input
          value={form.number}
          onChange={(e) => set({ number: e.target.value })}
          className="h-9 w-28 font-mono text-sm"
          placeholder="RFC-000"
        />
        <Input
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          className="h-9 flex-1 text-base font-semibold"
          placeholder="Spec title"
        />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" size="sm">
              <Badge className={statusMeta.badge}>{statusMeta.label}</Badge>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SPEC_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s.value}
                active={s.value === form.status}
                onSelect={() => set({ status: s.value as SpecStatus })}
              >
                <Badge className={s.badge}>{s.label}</Badge>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete spec"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-5 py-4">
        <div className="mx-auto max-w-3xl space-y-5">
          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                Implementation progress
              </span>
              <span className="tabular-nums">
                {doneCount}/{linkedTasks.length} tasks · {progress}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Purpose */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Purpose
            </label>
            <Textarea
              value={form.purpose}
              onChange={(e) => set({ purpose: e.target.value })}
              placeholder="Why does this spec exist?"
              rows={3}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <StringListEditor
              label="Goals"
              items={form.goals}
              onChange={(goals) => set({ goals })}
            />
            <StringListEditor
              label="Features"
              items={form.features}
              onChange={(features) => set({ features })}
            />
            <StringListEditor
              label="Constraints"
              items={form.constraints}
              onChange={(constraints) => set({ constraints })}
            />
            <StringListEditor
              label="Dependencies"
              items={form.dependencies}
              onChange={(dependencies) => set({ dependencies })}
            />
            <StringListEditor
              label="Acceptance criteria"
              items={form.acceptance}
              onChange={(acceptance) => set({ acceptance })}
            />
            <StringListEditor
              label="Risks"
              items={form.risks}
              onChange={(risks) => set({ risks })}
            />
          </div>

          <StringListEditor
            label="Future improvements"
            items={form.futureImprovements}
            onChange={(futureImprovements) => set({ futureImprovements })}
          />

          {/* Technical notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Technical notes
            </label>
            <Textarea
              value={form.technicalNotes}
              onChange={(e) => set({ technicalNotes: e.target.value })}
              placeholder="Implementation notes, diagrams, references…"
              rows={4}
              className="font-mono text-xs"
            />
          </div>

          {/* Linked notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Linked notes
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="outline" size="sm">
                    <Plus className="h-3.5 w-3.5" /> Link note
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-72 w-64 overflow-y-auto"
                >
                  <DropdownMenuLabel>Link a note</DropdownMenuLabel>
                  {unlinkedNotes.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      No more notes to link.
                    </div>
                  ) : (
                    unlinkedNotes.map((n) => (
                      <DropdownMenuItem
                        key={n.id}
                        onSelect={() =>
                          set({ linkedNoteIds: [...form.linkedNoteIds, n.id] })
                        }
                      >
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{n.title}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {linkedNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground/70">
                No notes linked.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {linkedNotes.map((n) => (
                  <span
                    key={n.id}
                    className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs text-primary"
                  >
                    <FileText className="h-3 w-3" />
                    {n.title}
                    <button
                      type="button"
                      aria-label={`Unlink ${n.title}`}
                      onClick={() =>
                        set({
                          linkedNoteIds: form.linkedNoteIds.filter(
                            (id) => id !== n.id,
                          ),
                        })
                      }
                      className="hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Linked tasks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Tasks
              </label>
              <Button variant="outline" size="sm" onClick={onCreateTask}>
                <Plus className="h-3.5 w-3.5" /> New task
              </Button>
            </div>
            {linkedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground/70">
                No tasks yet. Create one to start implementation.
              </p>
            ) : (
              <ul className="space-y-1">
                {linkedTasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(t.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent",
                      )}
                    >
                      <KanbanSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate">{t.title}</span>
                      <Badge variant="outline">{taskStatusLabel(t.status)}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
