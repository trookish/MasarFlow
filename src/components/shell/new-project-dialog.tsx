"use client";

import { useState } from "react";
import { FolderPlus, Pencil } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { projectsRepo, categoriesRepo } from "@/lib/db/repos";
import type { Project } from "@/lib/db/schema";
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

function toFields(p: Project): ProjectFieldValues {
  return {
    name: p.name,
    icon: p.icon,
    iconImage: p.iconImage,
    accent: p.accent,
    description: p.description,
    tags: p.tags,
    category: p.category,
    banner: p.banner,
    bannerMode: p.bannerMode,
    bannerBlur: p.bannerBlur,
    bannerBrightness: p.bannerBrightness,
  };
}

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after a project is created or edited; receives the persisted record
   * id.
   */
  onCreated: (projectId: string) => void;
  /**
   * When set, the dialog edits this project instead of creating a new one.
   */
  project?: Project | null;
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
  project,
  mode = "modal",
  onFirstRunSkip,
}: NewProjectDialogProps) {
  const editing = Boolean(project);
  const projectId = project?.id ?? null;
  const [fields, setFields] = useState<ProjectFieldValues>(() =>
    project ? toFields(project) : EMPTY_PROJECT_FIELDS,
  );
  const [saving, setSaving] = useState(false);
  // Categories added in the create dialog can't hit the DB until the project
  // exists; they're collected here and persisted right after creation.
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);

  // Re-initialize the form whenever the target project changes.
  const [prevId, setPrevId] = useState<string | null>(projectId);
  if (prevId !== projectId) {
    setPrevId(projectId);
    setFields(project ? toFields(project) : EMPTY_PROJECT_FIELDS);
    setPendingCategories([]);
  }

  // Edit mode: categories are loaded live from the project (create mode keeps
  // its pending list instead). Always resolves to a promise — Dexie's
  // liveQuery requires one even for the no-project case.
  const projectCategories = useLiveQuery(
    async () => (projectId ? categoriesRepo.listByProject(projectId) : []),
    [projectId],
  );
  const editCategories = (projectCategories ?? []).map((c) => c.name);

  const firstRun = mode === "first-run";
  const canSubmit = fields.name.trim().length > 0 && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (editing && project) {
        await projectsRepo.update(project.id, {
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
      } else {
        const created = await projectsRepo.create({
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
        for (const name of pendingCategories) {
          await categoriesRepo.ensure(created.id, name);
        }
        onCreated(created.id);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-2xl"
      showClose={!firstRun}
      ariaLabel={editing ? "Edit project" : "New project"}
    >
      <DialogHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            {editing ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
          </span>
          <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
        </div>
        <DialogDescription>
          {firstRun
            ? "Welcome to MasarFlow. Set up your first project to get started."
            : editing
              ? "Update the project's identity — save to apply the changes."
              : "Give your project an identity — you can change everything later."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <ScrollArea className="max-h-[55vh] pr-4">
          <ProjectFields
            value={fields}
            onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
            categories={editing ? editCategories : pendingCategories}
            onAddCategory={
              editing && projectId
                ? (name) => categoriesRepo.ensure(projectId, name)
                : (name) =>
                    setPendingCategories((c) =>
                      c.some((x) => x.toLowerCase() === name.toLowerCase())
                        ? c
                        : [...c, name],
                    )
            }
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
        <Button onClick={() => void submit()} disabled={!canSubmit}>
          {saving
            ? editing
              ? "Saving…"
              : "Creating…"
            : editing
              ? "Save changes"
              : "Create project"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
