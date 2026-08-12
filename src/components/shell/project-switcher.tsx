"use client";

import { useState } from "react";
import { ChevronsUpDown, Plus, Check, Pencil, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { projectsRepo } from "@/lib/db/repos";
import type { Project } from "@/lib/db/schema";
import { useProjectStore } from "@/lib/stores/project";
import { useActiveProject } from "@/lib/hooks/use-project";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  useDropdown,
} from "@/components/ui/dropdown-menu";
import { NewProjectDialog } from "./new-project-dialog";
import {
  RemoveProjectDialog,
  removeProjectQuietly,
} from "./remove-project-dialog";
import { ProjectIcon } from "./project-fields";
import { cn } from "@/lib/utils/cn";

export function ProjectSwitcher() {
  const [creating, setCreating] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [removeProject, setRemoveProject] = useState<Project | null>(null);

  return (
    <>
      <DropdownMenu>
        <SwitcherMenu
          onNew={() => setCreating(true)}
          onEdit={(p) => setEditProject(p)}
          onRemove={(p) => setRemoveProject(p)}
        />
      </DropdownMenu>

      <NewProjectDialog
        key={editProject?.id ?? "create"}
        open={creating || editProject !== null}
        project={editProject}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditProject(null);
          }
        }}
        onCreated={(id) => {
          setCreating(false);
          setEditProject(null);
          useProjectStore.getState().setActiveProjectId(id);
        }}
      />

      <RemoveProjectDialog
        open={removeProject !== null}
        project={removeProject}
        onOpenChange={(open) => {
          if (!open) setRemoveProject(null);
        }}
        onRemoved={() => {
          if (!removeProject) return;
          if (useProjectStore.getState().activeProjectId === removeProject.id) {
            useProjectStore.getState().setActiveProjectId(null);
          }
          setRemoveProject(null);
        }}
      />
    </>
  );
}

/** The dropdown content; lives inside <DropdownMenu> to access its context. */
function SwitcherMenu({
  onNew,
  onEdit,
  onRemove,
}: {
  onNew: () => void;
  onEdit: (p: Project) => void;
  onRemove: (p: Project) => void;
}) {
  const projects = useLiveQuery(() => projectsRepo.all(), []);
  const active = useActiveProject();
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const { setOpen: setMenuOpen } = useDropdown();

  function selectProject(id: string) {
    setActiveProjectId(id);
    setMenuOpen(false);
  }

  function openEdit(p: Project) {
    setMenuOpen(false);
    onEdit(p);
  }

  async function openRemove(p: Project) {
    setMenuOpen(false);
    // Honoring the "don't ask again" preference: delete immediately (the
    // helper also clears the active project if it was the deleted one).
    const removed = await removeProjectQuietly(p);
    if (!removed) onRemove(p);
  }

  return (
    <>
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
      <DropdownMenuContent className="w-72">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {(projects ?? []).map((p) => (
          <div
            key={p.id}
            className={cn(
              "group flex items-center gap-1 rounded-md",
              p.id === active?.id ? "bg-accent/60" : "hover:bg-accent/60",
            )}
          >
            <button
              type="button"
              onClick={() => selectProject(p.id)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
            >
              <ProjectIcon
                icon={p.icon}
                iconImage={p.iconImage}
                accent={p.accent}
              />
              <span className="truncate">{p.name}</span>
              {p.id === active?.id ? (
                <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
              ) : null}
            </button>
            <button
              type="button"
              aria-label={`Edit ${p.name}`}
              title="Edit project"
              onClick={() => openEdit(p)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${p.name}`}
              title="Delete project"
              onClick={() => void openRemove(p)}
              className="rounded-md p-1.5 pr-2 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNew}>
          <Plus className="h-4 w-4" /> New project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </>
  );
}
