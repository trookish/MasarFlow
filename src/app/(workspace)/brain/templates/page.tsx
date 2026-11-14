"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Plus, FileText, Trash2, Edit2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useNoteTemplates, upsertNoteTemplate, deleteNoteTemplate } from "@/lib/db/repos/notes";
import { NOTE_TYPES, type NoteTemplate, type NoteType } from "@/lib/db/schema";
import { uid, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function TemplatesPage() {
  const project = useActiveProject();
  const templates = useNoteTemplates(project?.id);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<NoteTemplate | null>(null);

  // Form state
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<NoteType>("note");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);

  const openDialog = (template?: NoteTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setName(template.name);
      setType(template.type);
      setTitle(template.title);
      setBody(template.body);
      setIsDefault(template.isDefault);
    } else {
      setEditingTemplate(null);
      setName("");
      setType("note");
      setTitle("");
      setBody("");
      setIsDefault(false);
    }
    setDialogOpen(true);
  };

  const onSave = async () => {
    if (!project) return;
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }

    const now = Date.now();
    
    // If setting as default, unset others of this type
    if (isDefault) {
      const others = templates?.filter(t => t.type === type && t.id !== editingTemplate?.id) || [];
      for (const t of others) {
        if (t.isDefault) {
          await upsertNoteTemplate({ ...t, isDefault: false, updatedAt: now });
        }
      }
    }

    const template: NoteTemplate = {
      id: editingTemplate?.id || uid("tpl"),
      projectId: project.id,
      name: name.trim(),
      type,
      title: title.trim(),
      body,
      isDefault,
      createdAt: editingTemplate?.createdAt || now,
      updatedAt: now,
    };

    try {
      await upsertNoteTemplate(template);
      toast.success(editingTemplate ? "Template updated" : "Template created");
      setDialogOpen(false);
    } catch (e) {
      toast.error("Failed to save template", { description: (e as Error).message });
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      await deleteNoteTemplate(id);
      toast.success("Template deleted");
    } catch (e) {
      toast.error("Failed to delete", { description: (e as Error).message });
    }
  };

  return (
    <div className="pb-10">
      <div className="px-6 pt-4">
        <Link
          href="/brain"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Brain
        </Link>
      </div>

      <PageHeader
        icon={FileText}
        eyebrow="Settings"
        title="Note Templates"
        description="Manage the default structure for different note types."
        actions={
          <Button onClick={() => openDialog()} className="gap-2">
            <Plus className="h-4 w-4" /> New template
          </Button>
        }
      />

      <div className="px-6 py-5 space-y-4">
        {templates?.length === 0 ? (
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
            No templates configured.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates?.map((t) => (
              <Card key={t.id} className="relative group">
                <CardContent className="p-4 flex flex-col h-full gap-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm leading-none flex items-center gap-2">
                        {t.name}
                        {t.isDefault && (
                          <span className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0.5 rounded-sm uppercase font-bold tracking-wider">
                            Default
                          </span>
                        )}
                      </h3>
                      <div className="text-muted-foreground text-[11px] uppercase tracking-wider font-semibold mt-1">
                        Type: {t.type}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openDialog(t)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => onDelete(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 mt-2">
                    {t.title && (
                      <div className="text-xs text-muted-foreground mb-1 truncate font-mono">
                        Title: {t.title}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground font-mono bg-muted p-2 rounded max-h-24 overflow-hidden text-ellipsis whitespace-pre-wrap">
                      {t.body || "(Empty body)"}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-2">
                    Updated {formatRelativeTime(t.updatedAt)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>Define the starting content for a note.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Template Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard ADR" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Note Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as NoteType)}
                  className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
                >
                  {NOTE_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="space-y-1.5 flex items-center gap-2">
              <input type="checkbox" id="isDefault" checked={isDefault} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsDefault(e.target.checked)} className="rounded bg-background border-border" />
              <label htmlFor="isDefault" className="text-sm font-medium">Make default for {type} notes</label>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Default Title (optional)</label>
              <Input value={title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} placeholder="e.g. ADR-XXX: " />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Body Content (Markdown)</label>
              <Textarea 
                value={body} 
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)} 
                className="h-48 font-mono text-sm"
                placeholder="## Background..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={onSave}>Save template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
