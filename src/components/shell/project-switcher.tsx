"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUi } from "@/lib/stores/ui";
import { useProjects } from "@/lib/db/repos/projects";
import { Compass, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";

export function ProjectSwitcher() {
  const open = useUi((s) => s.projectSwitcherOpen);
  const setOpen = useUi((s) => s.setProjectSwitcherOpen);
  const projects = useProjects();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="border-border border-b p-5">
          <DialogTitle className="flex items-center gap-2">
            <Compass className="h-4 w-4" /> Projects
          </DialogTitle>
          <DialogDescription>Switch context or start a new one.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {projects?.length === 0 && (
            <div className="text-muted-foreground p-6 text-center text-sm">No projects yet.</div>
          )}
          {projects?.map((p) => (
            <button
              key={p.id}
              className="hover:border-border hover:bg-accent/40 flex w-full items-center gap-3 rounded-md border border-transparent p-3 text-left transition-colors"
            >
              <span className="from-primary to-info text-primary-foreground grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br text-sm font-bold">
                {p.name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-muted-foreground truncate text-xs">{p.description}</div>
              </div>
              <div className="text-muted-foreground text-right text-[10px]">
                <div>health {p.health}</div>
                <div>updated {formatRelativeTime(p.updatedAt)}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="border-border border-t p-3">
          <Button variant="soft" className="w-full gap-2">
            <Plus className="h-4 w-4" /> New project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
