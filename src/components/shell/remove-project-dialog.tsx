"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { projectsRepo } from "@/lib/db/repos";
import type { Project } from "@/lib/db/schema";
import { useProjectStore } from "@/lib/stores/project";
import { useProjectConfirmStore } from "@/lib/stores/project-confirm";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RemoveProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the project (and all its data) has been deleted. */
  onRemoved: () => void;
}

/** Confirmation dialog for deleting a project, with a "don't ask again" opt-out. */
export function RemoveProjectDialog({
  project,
  open,
  onOpenChange,
  onRemoved,
}: RemoveProjectDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const skip = useProjectConfirmStore((s) => s.skipProjectDeleteConfirm);
  const setSkip = useProjectConfirmStore((s) => s.setSkipProjectDeleteConfirm);

  async function confirmDelete() {
    if (!project || deleting) return;
    setDeleting(true);
    try {
      await projectsRepo.remove(project.id);
      onRemoved();
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-md"
      ariaLabel="Delete project"
    >
      <DialogHeader>
        <DialogTitle>Delete project?</DialogTitle>
        <DialogDescription>
          “{project?.name ?? "This project"}” and everything in it — notes,
          specs, tasks, sprints, standards, docs, canvases, dev logs, and
          memories — will be permanently deleted from this browser. This cannot
          be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card p-2.5">
          <input
            type="checkbox"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span className="text-xs text-muted-foreground">
            Don&apos;t ask me again — delete projects immediately (re-enable in
            Settings → Data).
          </span>
        </label>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={() => void confirmDelete()}
          disabled={!project || deleting}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deleting ? "Deleting…" : "Delete project"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/**
 * Delete a project, honoring the "don't ask again" preference: when the user
 * opted out, the project is removed immediately (returns true); otherwise the
 * caller is expected to show the confirmation dialog.
 */
export async function removeProjectQuietly(project: Project): Promise<boolean> {
  if (!useProjectConfirmStore.getState().skipProjectDeleteConfirm)
    return false;
  await projectsRepo.remove(project.id);
  if (useProjectStore.getState().activeProjectId === project.id) {
    useProjectStore.getState().setActiveProjectId(null);
  }
  return true;
}
