"use client";

import { LayoutTemplate } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { noteTemplatesRepo } from "@/lib/db/repos";
import type { NoteTemplate } from "@/lib/db/schema";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface TemplatePickerProps {
  projectId: string;
  onPick: (template: NoteTemplate) => void;
}

export function TemplatePicker({ projectId, onPick }: TemplatePickerProps) {
  const templates = useLiveQuery(
    () => noteTemplatesRepo.listByProject(projectId),
    [projectId],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline" size="sm">
          <LayoutTemplate className="h-3.5 w-3.5" />
          Template
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel>Insert template</DropdownMenuLabel>
        {(templates ?? []).length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            No templates yet.
          </div>
        ) : (
          (templates ?? []).map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => onPick(t)}>
              <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{t.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
