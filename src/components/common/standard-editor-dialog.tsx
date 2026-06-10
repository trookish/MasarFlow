"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Lock, Plus, Trash2, ShieldCheck, Sparkles } from "lucide-react";
import { useActiveProject } from "@/lib/db/repos/projects";
import { getDb, STANDARD_CATEGORIES, type Standard, type StandardCategory } from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StandardEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standard?: Standard;
}

export function StandardEditorDialog({ open, onOpenChange, standard }: StandardEditorDialogProps) {
  const router = useRouter();
  const project = useActiveProject();
  const [title, setTitle] = React.useState("");
  const [rule, setRule] = React.useState("");
  const [category, setCategory] = React.useState<StandardCategory>("naming");
  const [enforced, setEnforced] = React.useState(true);
  const [examples, setExamples] = React.useState<string[]>([""]);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (standard) {
      setTitle(standard.title);
      setRule(standard.rule);
      setCategory(standard.category);
      setEnforced(standard.enforced);
      setExamples(standard.examples.length > 0 ? standard.examples : [""]);
    } else if (open) {
      setTitle("");
      setRule("");
      setCategory("naming");
      setEnforced(true);
      setExamples([""]);
    }
  }, [standard, open]);

  const onSave = async () => {
    if (!project) return;
    if (!title.trim() || !rule.trim()) {
      toast.error("Title and rule are required");
      return;
    }
    setSubmitting(true);
    const cleanExamples = examples.map((e) => e.trim()).filter(Boolean);
    const now = Date.now();
    const record: Standard = {
      id: standard?.id ?? uid("std"),
      projectId: project.id,
      title: title.trim(),
      rule: rule.trim(),
      category,
      enforced,
      examples: cleanExamples,
      createdAt: standard?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await getDb().standards.put(record);
      toast.success(standard ? "Standard updated" : "Standard created");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error("Failed to save", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {standard ? "Edit standard" : "New standard"}
          </DialogTitle>
          <DialogDescription>
            Every AI action will follow this rule. Code generated should look like you wrote it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Title</label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. PascalCase for public members"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Rule</label>
            <textarea
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              rows={3}
              placeholder="Describe the rule in plain language."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as StandardCategory)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {STANDARD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Enforcement</label>
              <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-2.5">
                <Switch checked={enforced} onCheckedChange={setEnforced} />
                <span className="text-xs">{enforced ? "Enforced" : "Suggested"}</span>
                {enforced ? (
                  <Badge variant="success" className="ml-auto gap-1">
                    <Lock className="h-3 w-3" />
                    enforced
                  </Badge>
                ) : (
                  <Badge variant="ghost" className="ml-auto">
                    suggested
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Examples</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExamples((p) => [...p, ""])}
                className="gap-1 text-[10px]"
              >
                <Plus className="h-3 w-3" />
                Add example
              </Button>
            </div>
            <div className="space-y-2">
              {examples.map((e, i) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea
                    value={e}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setExamples((p) => p.map((x, idx) => (idx === i ? v : x)));
                    }}
                    rows={Math.max(1, e.split("\n").length)}
                    placeholder="// good or bad example"
                    className="flex-1 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setExamples((p) => (p.length === 1 ? [""] : p.filter((_, idx) => idx !== i)))
                    }
                    className="mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-[color:var(--danger)]"
                    aria-label="Remove example"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-[color:var(--primary)]" />
              AI agents will reference this standard in every plan and code review.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={submitting} className={cn(submitting && "opacity-60")}>
                {submitting ? "Saving…" : standard ? "Save changes" : "Create standard"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
