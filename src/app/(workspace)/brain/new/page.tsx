"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useFolders } from "@/lib/db/repos/misc";
import { getDb, NOTE_TYPES, type Note, type NoteType } from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NewNotePage() {
  const router = useRouter();
  const project = useActiveProject();
  const folders = useFolders(project?.id);
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<NoteType>("note");
  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const onCreate = async () => {
    if (!project) return;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    const now = Date.now();
    const note: Note = {
      id: uid("note"),
      projectId: project.id,
      type,
      title: title.trim(),
      body: "",
      excerpt: "",
      tags: [],
      folderId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await getDb().notes.put(note);
      toast.success("Note created", { description: "Start writing…" });
      router.push(`/brain/${note.id}`);
    } catch (e) {
      toast.error("Failed to create", { description: (e as Error).message });
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href="/brain"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Brain
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>New note</CardTitle>
          <CardDescription>Every note in MasarFlow is permanent project memory.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Title</label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Climbing mechanic — design notes"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  onCreate();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Type</label>
            <div className="flex flex-wrap gap-1">
              {NOTE_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
                    type === t
                      ? "border-foreground/30 bg-accent"
                      : "border-border text-muted-foreground hover:border-foreground/20",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {folders && folders.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Folder (optional)</label>
              <select
                value={folderId ?? ""}
                onChange={(e) => setFolderId(e.target.value || null)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border bg-surface-2 px-1 font-mono text-[10px]">⌘ ↵</kbd> to create
            </span>
            <Button onClick={onCreate} disabled={submitting} className="gap-1.5">
              <Plus className="h-4 w-4" /> Create note
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
