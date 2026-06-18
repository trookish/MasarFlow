"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2, LayoutTemplate } from "lucide-react";
import { noteTemplatesRepo } from "@/lib/db/repos";
import { NOTE_TYPES, type NoteTemplate, type NoteType } from "@/lib/db/schema";
import { NOTE_TYPE_DOT } from "@/lib/colors";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

export function TemplatesManager() {
  const projectId = useActiveProjectId();
  const templates = useLiveQuery(
    () => noteTemplatesRepo.listByProject(projectId),
    [projectId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = templates ?? [];
  const selected = list.find((t) => t.id === selectedId) ?? null;

  async function createTemplate() {
    if (!projectId) return;
    const tpl = await noteTemplatesRepo.create({
      projectId,
      name: "Untitled template",
      body: "# {{title}}\n\n",
    });
    setSelectedId(tpl.id);
  }

  async function deleteTemplate(id: string) {
    await noteTemplatesRepo.remove(id);
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border p-2">
          <span className="px-1 text-sm font-medium">Templates</span>
          <Button
            size="icon-sm"
            aria-label="New template"
            onClick={createTemplate}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-2">
          {list.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No templates yet.
            </p>
          ) : (
            list.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "mb-1 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left",
                  t.id === selectedId
                    ? "border-border bg-accent"
                    : "border-transparent hover:bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    NOTE_TYPE_DOT[t.type],
                  )}
                />
                <span className="flex-1 truncate text-sm">{t.name}</span>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      <div className="min-w-0 flex-1">
        {selected ? (
          <TemplateForm
            key={selected.id}
            template={selected}
            onDelete={() => deleteTemplate(selected.id)}
          />
        ) : (
          <EmptyState
            icon={LayoutTemplate}
            title="No template selected"
            description="Templates give new notes a head start. Use {{title}} as a placeholder."
            action={
              <Button onClick={createTemplate} disabled={!projectId}>
                <Plus className="h-4 w-4" /> New template
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

function TemplateForm({
  template,
  onDelete,
}: {
  template: NoteTemplate;
  onDelete: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [type, setType] = useState<NoteType>(template.type);
  const [body, setBody] = useState(template.body);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const handle = setTimeout(() => {
      void noteTemplatesRepo.update(template.id, {
        name,
        description,
        type,
        body,
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [name, description, type, body, template.id]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-5">
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="text-base font-semibold"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete template"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description"
          className="text-xs"
        />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" size="sm">
              <span
                className={cn("h-2.5 w-2.5 rounded-full", NOTE_TYPE_DOT[type])}
              />
              <span className="capitalize">{type}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {NOTE_TYPES.map((t) => (
              <DropdownMenuItem
                key={t}
                active={t === type}
                onSelect={() => setType(t)}
              >
                <span
                  className={cn("h-2.5 w-2.5 rounded-full", NOTE_TYPE_DOT[t])}
                />
                <span className="capitalize">{t}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Template body (Markdown). Use {{title}} placeholder…"
        className="scrollbar-thin min-h-0 flex-1 resize-none rounded-none border-0 px-5 py-4 font-mono text-sm focus-visible:ring-0"
      />
    </div>
  );
}
