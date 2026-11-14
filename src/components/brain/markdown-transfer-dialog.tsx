"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileType2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getDb, type Note, NOTE_TYPES } from "@/lib/db/schema";
import { useActiveProject } from "@/lib/db/repos/projects";
import { uid } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as fflate from "fflate";
import matter from "gray-matter";

interface MarkdownTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "export" | "import" | "both";
}

export function MarkdownTransferDialog({ open, onOpenChange, mode }: MarkdownTransferDialogProps) {
  const project = useActiveProject();
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ ok: boolean; count: number; error?: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setError(null);
      setResult(null);
    }
  };

  const onExport = async () => {
    if (!project) return;
    setWorking(true);
    try {
      const notes = await getDb().notes.where("projectId").equals(project.id).toArray();
      if (notes.length === 0) throw new Error("No notes to export.");

      const files: Record<string, Uint8Array> = {};
      const encoder = new TextEncoder();

      for (const note of notes) {
        const frontmatter = {
          title: note.title,
          type: note.type,
          tags: note.tags,
          createdAt: new Date(note.createdAt).toISOString(),
          updatedAt: new Date(note.updatedAt).toISOString(),
        };
        const mdContent = matter.stringify(note.body || "", frontmatter);
        const filename = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || note.id}.md`;
        
        let finalName = filename;
        let counter = 1;
        while (files[finalName]) {
          finalName = `${filename.replace('.md', '')}-${counter}.md`;
          counter++;
        }
        files[finalName] = encoder.encode(mdContent);
      }

      const zipped = fflate.zipSync(files);
      const blob = new Blob([zipped], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `masarflow-notes-${project.slug}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Export ready", { description: `${notes.length} notes exported to ZIP.` });
      onOpenChange(false);
    } catch (e) {
      toast.error("Export failed", { description: (e as Error).message });
    } finally {
      setWorking(false);
    }
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !project) return;
    setWorking(true);
    setError(null);
    setResult(null);

    try {
      const now = Date.now();
      const newNotes: Note[] = [];
      let importedCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name.endsWith(".md")) continue;
        
        const text = await file.text();
        const parsed = matter(text);
        
        const data = parsed.data;
        const title = data.title || file.name.replace(/\.md$/, "");
        const type = (NOTE_TYPES as readonly string[]).includes(data.type) ? data.type : "note";
        const tags = Array.isArray(data.tags) ? data.tags : [];
        const body = parsed.content;

        newNotes.push({
          id: uid("note"),
          projectId: project.id,
          type,
          title,
          body,
          excerpt: body.replace(/[#>*`]/g, "").slice(0, 140),
          tags,
          folderId: null,
          createdAt: data.createdAt ? new Date(data.createdAt).getTime() : now,
          updatedAt: data.updatedAt ? new Date(data.updatedAt).getTime() : now,
        });
        importedCount++;
      }

      if (newNotes.length > 0) {
        await getDb().notes.bulkPut(newNotes);
      }

      setResult({ ok: true, count: importedCount });
      if (importedCount > 0) {
        toast.success("Import complete", { description: `${importedCount} notes imported.` });
      } else {
        toast.error("No valid markdown files found.");
      }
    } catch (err) {
      setError((err as Error).message);
      setResult({ ok: false, count: 0, error: (err as Error).message });
    } finally {
      setWorking(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isBoth = mode === "both";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileType2 className="h-4 w-4" /> Markdown Transfer
          </DialogTitle>
          <DialogDescription>
            Export notes to Markdown (ZIP), or import Markdown files into Brain.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="grid grid-cols-2 gap-2">
            {(mode === "export" || isBoth) && (
              <button
                onClick={onExport}
                disabled={working}
                className={cn(
                  "border-border bg-card hover:border-foreground/30 flex flex-col items-center gap-2 rounded-md border p-6 text-sm transition-colors",
                  working && "opacity-60",
                )}
              >
                <Download className="h-6 w-6 text-[color:var(--primary)]" />
                <span className="font-medium">Export all to ZIP</span>
                <span className="text-muted-foreground text-[10px]">Markdown files with frontmatter</span>
              </button>
            )}
            
            {(mode === "import" || isBoth) && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={working}
                className={cn(
                  "border-border bg-card hover:border-foreground/30 flex flex-col items-center gap-2 rounded-md border p-6 text-sm transition-colors",
                  working && "opacity-60",
                )}
              >
                <Upload className="h-6 w-6 text-[color:var(--info)]" />
                <span className="font-medium">Import Markdown</span>
                <span className="text-muted-foreground text-[10px]">Select multiple .md files</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              multiple
              onChange={onImport}
              className="hidden"
            />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10 p-3 text-xs text-[color:var(--danger)]">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </div>
        )}

        {result && (
          <div
            className={
              "rounded-md border p-3 text-xs " +
              (result.ok
                ? "border-[color:var(--success)]/30 bg-[color:var(--success)]/10"
                : "border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10")
            }
          >
            <div className="mb-1 flex items-center gap-2">
              {result.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--success)]" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--danger)]" />
              )}
              <span className="font-medium">
                {result.ok ? "Import succeeded" : "Import failed"}
              </span>
            </div>
            {result.error && <div className="text-[10px]">{result.error}</div>}
            {result.ok && (
              <div className="mt-1 text-[10px]">
                Imported {result.count} note{result.count !== 1 ? "s" : ""}.
              </div>
            )}
            <Button onClick={() => onOpenChange(false)} className="mt-2 w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
