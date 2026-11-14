"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Sparkles, Wand2 } from "lucide-react";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSpecs } from "@/lib/db/repos/specs";
import { getDb, type Doc, type Spec } from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { toast } from "sonner";

const RichEditor = dynamic(
  () => import("@/components/editor/rich-editor").then((m) => m.RichEditor),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full" /> },
);

interface DocEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc?: Doc;
  defaultKind?: Doc["kind"];
}

export function DocEditorDialog({ open, onOpenChange, doc, defaultKind }: DocEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" key={open ? `open-${doc?.id ?? "new"}` : "closed"}>
        <DocEditorForm doc={doc} defaultKind={defaultKind} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function DocEditorForm({
  doc,
  defaultKind,
  onOpenChange,
}: {
  doc?: Doc;
  defaultKind?: Doc["kind"];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const project = useActiveProject();
  const specs = useSpecs(project?.id);
  const [title, setTitle] = React.useState(doc ? doc.title : "");
  const [body, setBody] = React.useState(doc ? doc.body : "");
  const [kind, setKind] = React.useState<Doc["kind"]>(doc ? doc.kind : (defaultKind ?? "system"));
  const [generatedFrom, setGeneratedFrom] = React.useState<string | null>(
    doc ? (doc.generatedFrom ?? null) : null,
  );
  const [submitting, setSubmitting] = React.useState(false);

  const autoStub = (spec: Spec) => {
    const stub = [
      "# " + spec.title,
      "",
      "> Generated from " + spec.number + ". Edit freely.",
      "",
      "## Purpose",
      spec.purpose,
      "",
      "## Goals",
      ...spec.goals.map((g) => "- " + g),
      "",
      "## Acceptance criteria",
      ...spec.acceptance.map((a) => "- " + a),
      "",
      "## Technical notes",
      spec.technicalNotes,
      "",
      "## Public API",
      "(auto-generated from code; populated on next sync)",
    ].join("\n");
    setBody(stub);
    setTitle(spec.title);
    setKind(spec.title.toLowerCase().includes("api") ? "api" : "system");
    setGeneratedFrom("spec_" + spec.id);
    toast.success("Doc stubbed from spec", { description: spec.title });
  };

  const onSave = async () => {
    if (!project) return;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    const now = Date.now();
    const record: Doc = {
      id: doc?.id ?? uid("doc"),
      projectId: project.id,
      title: title.trim(),
      body,
      kind,
      generatedFrom,
      updatedAt: now,
    };
    try {
      await getDb().docs.put(record);
      toast.success(doc ? "Doc updated" : "Doc created");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error("Failed to save", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          {doc ? "Edit doc" : "New doc"}
        </DialogTitle>
        <DialogDescription>
          Auto-maintained from specs and code. You can also author docs by hand.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="text-xs font-medium">Title</label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Save System"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Kind</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Doc["kind"])}
              className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="system">System</option>
              <option value="api">API</option>
              <option value="arch">Architecture</option>
              <option value="tutorial">Tutorial</option>
              <option value="guide">Guide</option>
            </select>
          </div>
        </div>
        <div className="border-border bg-surface-2 flex items-center justify-between rounded-md border border-dashed px-3 py-2">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Wand2 className="h-3.5 w-3.5 text-[color:var(--primary)]" />
            <span>Auto-stub from spec</span>
            {generatedFrom && (
              <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                {generatedFrom}
              </span>
            )}
          </div>
          <select
            className="border-border bg-background h-7 rounded-md border px-2 text-xs"
            defaultValue=""
            onChange={(e) => {
              const spec = specs?.find((s) => s.id === e.target.value);
              if (spec) autoStub(spec);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Choose spec…
            </option>
            {specs?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number} — {s.title}
              </option>
            ))}
          </select>
        </div>
        <RichEditor
          value={body}
          onChange={setBody}
          placeholder="Write the doc…"
          minHeightClass="min-h-[300px]"
        />
        <div className="border-border flex items-center justify-between border-t pt-3">
          <div className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
            <Sparkles className="h-3 w-3 text-[color:var(--primary)]" />
            Docs in MasarFlow never go stale — they regenerate on the next sync.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={submitting}>
              {submitting ? "Saving…" : doc ? "Save changes" : "Create doc"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
