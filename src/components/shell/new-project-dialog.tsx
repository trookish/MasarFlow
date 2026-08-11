"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { projectsRepo } from "@/lib/db/repos";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ProjectFields,
  ProjectPreview,
  type ProjectFieldValues,
} from "./project-fields";

export const EMPTY_PROJECT_FIELDS: ProjectFieldValues = {
  name: "",
  icon: "box",
  iconImage: "",
  accent: "violet",
  description: "",
  tags: [],
  category: "",
  banner: "",
  bannerMode: "none",
  bannerBlur: 0,
  bannerBrightness: 100,
};

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a project is created; receives the persisted record. */
  onCreated: (projectId: string) => void;
  /**
   * "modal": closable, standard "Cancel / Create" (project switcher).
   * "first-run": blocking — closing the dialog falls back to a default project.
   */
  mode?: "modal" | "first-run";
  onFirstRunSkip?: () => void;
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
  mode = "modal",
  onFirstRunSkip,
}: NewProjectDialogProps) {
  const [fields, setFields] =
    useState<ProjectFieldValues>(EMPTY_PROJECT_FIELDS);
  const [creating, setCreating] = useState(false);

  const firstRun = mode === "first-run";
  const canCreate = fields.name.trim().length > 0 && !creating;

  async function create() {
    if (!canCreate) return;
    setCreating(true);
    try {
      const project = await projectsRepo.create({
        name: fields.name.trim(),
        icon: fields.icon,
        iconImage: fields.iconImage,
        accent: fields.accent,
        description: fields.description.trim(),
        tags: fields.tags,
        category: fields.category,
        banner: fields.banner,
        bannerMode: fields.bannerMode,
        bannerBlur: fields.bannerBlur,
        bannerBrightness: fields.bannerBrightness,
      });
      onCreated(project.id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-2xl"
      showClose={!firstRun}
      ariaLabel="New project"
    >
      <DialogHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FolderPlus className="h-4 w-4" />
          </span>
          <DialogTitle>New project</DialogTitle>
        </div>
        <DialogDescription>
          {firstRun
            ? "Welcome to MasarFlow. Set up your first project to get started."
            : "Give your project an identity — you can change everything later."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <ScrollArea className="max-h-[55vh] pr-4">
          <ProjectFields
            value={fields}
            onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
          />
          <div className="mt-4 rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              Preview
            </p>
            <ProjectPreview value={fields} />
          </div>
        </ScrollArea>
      </DialogBody>
      <DialogFooter>
        {firstRun && onFirstRunSkip ? (
          <Button variant="ghost" onClick={onFirstRunSkip}>
            Start with My Project
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        )}
        <Button onClick={() => void create()} disabled={!canCreate}>
          {creating ? "Creating…" : "Create project"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
