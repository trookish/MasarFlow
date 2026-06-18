"use client";

import { useState } from "react";
import { ChevronsUpDown, Plus, Check, Box } from "lucide-react";
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
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectSwitcher() {
  const projects = useLiveQuery(() => projectsRepo.all(), []);
  const active = useActiveProject();
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function createProject() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const project = await projectsRepo.create({ name: trimmed });
    setActiveProjectId(project.id);
    setName("");
    setCreating(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm hover:bg-accent"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/15 text-primary">
              <Box className="h-3.5 w-3.5" />
            </span>
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
              <Box className="h-4 w-4" />
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

      <Dialog open={creating} onOpenChange={setCreating} className="max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Input
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createProject();
            }}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
          <Button onClick={createProject} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
