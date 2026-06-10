"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollText, Sparkles } from "lucide-react";
import { useActiveProject } from "@/lib/db/repos/projects";
import { DEVLOG_KINDS, getDb, type DevLog, type DevLogKind } from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { toast } from "sonner";

interface DevLogComposerProps { open: boolean; onOpenChange: (open: boolean) => void; }

const KIND_ICON: Record<DevLogKind, string> = { feature: "F", refactor: "R", decision: "D", discussion: "C", lesson: "L", failure: "X", success: "S", milestone: "M" };

export function DevLogComposer({ open, onOpenChange }: DevLogComposerProps) {
  const router = useRouter();
  const project = useActiveProject();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [kind, setKind] = React.useState<DevLogKind>("feature");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => { if (open) { setTitle(""); setBody(""); setKind("feature"); } }, [open]);

  const onPost = async () => {
    if (!project) return;
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    const record: DevLog = { id: uid("dl"), projectId: project.id, kind, title: title.trim(), body: body.trim(), refs: [], createdAt: Date.now() };
    try {
      await getDb().devLogs.put(record);
      toast.success("Dev log posted");
      onOpenChange(false);
      router.refresh();
    } catch (e) { toast.error("Failed to post", { description: (e as Error).message }); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScrollText className="h-4 w-4" />New dev log</DialogTitle>
          <DialogDescription>Post to the project timeline. Both you and AI agents can write here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Title</label>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Audio culling landed in v0.7.2" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Kind</label>
            <div className="flex flex-wrap gap-1.5">
              {DEVLOG_KINDS.map((k) => (
                <button key={k} onClick={() => setKind(k)} className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors " + (kind === k ? "border-foreground/30 bg-accent" : "border-border text-muted-foreground hover:border-foreground/20")}>
                  <span aria-hidden>{KIND_ICON[k]}</span>{k}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Optional context, links, or lessons learned." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-[color:var(--primary)]" />AI agents post here automatically when they make decisions.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={onPost} disabled={submitting}>{submitting ? "Posting…" : "Post log"}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
