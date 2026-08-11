"use client";

import { useState } from "react";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { projectsRepo } from "@/lib/db/repos";
import { useProjectStore } from "@/lib/stores/project";
import { useActiveProject } from "@/lib/hooks/use-project";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { NewProjectDialog } from "./new-project-dialog";
import { ProjectIcon } from "./project-fields";

export function ProjectSwitcher() {
  const projects = useLiveQuery(() => projectsRepo.all(), []);
  const active = useActiveProject();
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm hover:bg-accent"
          >
            <ProjectIcon
              icon={active?.icon}
              iconImage={active?.iconImage}
              accent={active?.accent}
            />
            <span className="max-w-[10rem] truncate font-medium">
              {active?.name ?? "Select project"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          {(projects ?? []).map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => setActiveProjectId(p.id)}
              active={p.id === active?.id}
            >
              <ProjectIcon
                icon={p.icon}
                iconImage={p.iconImage}
                accent={p.accent}
              />
              <span className="truncate">{p.name}</span>
              {p.id === active?.id ? (
                <Check className="ml-auto h-3.5 w-3.5" />
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewProjectDialog
        key={String(creating)}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => setActiveProjectId(id)}
      />
    </>
  );
}
