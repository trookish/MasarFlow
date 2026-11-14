"use client";
import * as React from "react";
import { FileText, Type, Image, Link as LinkIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CanvasNodeType } from "@/lib/db/schema";
import type { Note } from "@/lib/db/schema";

interface AddNodeDialogProps {
  notes: Note[];
  onAdd: (params: { type: CanvasNodeType; content: string; url?: string; noteId?: string }) => void;
  children?: React.ReactNode;
}

const TYPES: Array<{
  id: CanvasNodeType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "note", label: "Note", icon: FileText },
  { id: "text", label: "Text", icon: Type },
  { id: "image", label: "Image", icon: Image },
  { id: "link", label: "Link", icon: LinkIcon },
];

export function AddNodeDialog({ notes, onAdd, children }: AddNodeDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<CanvasNodeType>("text");
  const [content, setContent] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [noteId, setNoteId] = React.useState<string>("");

  const reset = () => {
    setType("text");
    setContent("");
    setUrl("");
    setNoteId("");
  };

  const handleAdd = () => {
    if (type === "note" && !noteId) return;
    if (type === "image" && !url && !content) return;
    if (type === "link" && !url && !content) return;
    onAdd({
      type,
      content: content.trim(),
      url: url.trim() || undefined,
      noteId: noteId || undefined,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add node</DialogTitle>
          <DialogDescription>Drop a new card onto the canvas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors",
                      type === t.id
                        ? "border-foreground/30 bg-accent"
                        : "border-border text-muted-foreground hover:border-foreground/20",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {type === "note" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Note</label>
              <select
                value={noteId}
                onChange={(e) => setNoteId(e.target.value)}
                className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">Select a note…</option>
                {notes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(type === "text" || type === "link") && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                {type === "link" ? "Label (optional)" : "Text"}
              </label>
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={type === "link" ? "e.g. RFC-014 spec" : "e.g. Design goals"}
              />
            </div>
          )}

          {(type === "image" || type === "link") && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={type === "note" ? !noteId : !content && !url}>
            Add node
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
