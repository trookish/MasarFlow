"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Trash2, Sparkles, BookOpen } from "lucide-react";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useTasksForSpec, useAllPlans } from "@/lib/db/repos/specs";
import { getDb, SPEC_STATUS, type Spec, type SpecStatus } from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface SpecEditorDialogProps { open: boolean; onOpenChange: (open: boolean) => void; spec?: Spec; onCreated?: (id: string) => void; }

const STATUS_LABEL: Record<SpecStatus, string> = { draft: "Draft", review: "In Review", approved: "Approved", implementing: "Implementing", shipped: "Shipped" };
const STATUS_COLOR: Record<SpecStatus, string> = { draft: "var(--muted-foreground)", review: "var(--warning)", approved: "var(--info)", implementing: "var(--primary)", shipped: "var(--success)" };

export function SpecEditorDialog({ open, onOpenChange, spec, onCreated }: SpecEditorDialogProps) {
  const router = useRouter();
  const project = useActiveProject();
  const existing = useTasksForSpec(spec?.id);
  const allPlans = useAllPlans();
  const planForSpec = spec ? allPlans?.find((p) => p.specId === spec.id) : undefined;
  const linkedNoteIds = spec?.linkedNoteIds ?? [];

  const [number, setNumber] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [status, setStatus] = React.useState<SpecStatus>("draft");
  const [goals, setGoals] = React.useState<string[]>([""]);
  const [features, setFeatures] = React.useState<string[]>([""]);
  const [constraints, setConstraints] = React.useState<string[]>([""]);
  const [dependencies, setDependencies] = React.useState<string[]>([""]);
  const [acceptance, setAcceptance] = React.useState<string[]>([""]);
  const [technicalNotes, setTechnicalNotes] = React.useState("");
  const [risks, setRisks] = React.useState<string[]>([""]);
  const [future, setFuture] = React.useState<string[]>([""]);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (spec) {
      setNumber(spec.number); setTitle(spec.title); setPurpose(spec.purpose); setStatus(spec.status);
      setGoals(orEmpty(spec.goals)); setFeatures(orEmpty(spec.features)); setConstraints(orEmpty(spec.constraints));
      setDependencies(orEmpty(spec.dependencies)); setAcceptance(orEmpty(spec.acceptance));
      setTechnicalNotes(spec.technicalNotes); setRisks(orEmpty(spec.risks)); setFuture(orEmpty(spec.futureImprovements));
    } else if (open) {
      setNumber("RFC-NEW"); setTitle(""); setPurpose(""); setStatus("draft");
      setGoals([""]); setFeatures([""]); setConstraints([""]); setDependencies([""]);
      setAcceptance([""]); setTechnicalNotes(""); setRisks([""]); setFuture([""]);
    }
  }, [spec, open]);

  function orEmpty<T>(arr: T[]): T[] { return arr.length > 0 ? arr : ["" as unknown as T]; }

  const onSave = async () => {
    if (!project) return;
    if (!title.trim() || !number.trim()) { toast.error("Number and title are required"); return; }
    setSubmitting(true);
    const now = Date.now();
    const record: Spec = {
      id: spec?.id ?? uid("spec"), projectId: project.id,
      number: number.trim(), title: title.trim(), status,
      purpose: purpose.trim(), goals: cleanList(goals), features: cleanList(features),
      constraints: cleanList(constraints), dependencies: cleanList(dependencies),
      acceptance: cleanList(acceptance), technicalNotes: technicalNotes.trim(),
      risks: cleanList(risks), futureImprovements: cleanList(future),
      implementationProgress: spec?.implementationProgress ?? 0,
      linkedNoteIds, linkedTaskIds: spec?.linkedTaskIds ?? [],
      createdAt: spec?.createdAt ?? now, updatedAt: now,
    };
    try {
      await getDb().specs.put(record);
      toast.success(spec ? "Spec updated" : `Spec ${record.number} created`);
      onOpenChange(false);
      if (!spec && onCreated) onCreated(record.id); else router.refresh();
    } catch (e) { toast.error("Failed to save", { description: (e as Error).message }); }
    finally { setSubmitting(false); }
  };

  const onDelete = async () => {
    if (!spec) return;
    if (existing && existing.length > 0) { toast.error("Cannot delete spec with linked tasks", { description: `Remove or reassign ${existing.length} task(s) first.` }); return; }
    if (planForSpec) { toast.error("Cannot delete spec with a plan", { description: "Delete the plan first." }); return; }
    if (!window.confirm(`Delete spec ${spec.number} — ${spec.title}?`)) return;
    try {
      await getDb().specs.delete(spec.id);
      toast.success("Spec deleted");
      onOpenChange(false);
      router.push("/specs");
    } catch (e) { toast.error("Failed to delete", { description: (e as Error).message }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />{spec ? `Edit ${spec.number}` : "New specification"}</DialogTitle>
          <DialogDescription>RFC-style documents. The grammar of every feature in MasarFlow.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-3 space-y-1.5"><label className="text-xs font-medium">Number</label><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="RFC-014" className="font-mono" /></div>
            <div className="col-span-9 space-y-1.5"><label className="text-xs font-medium">Title</label><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Climbing Mechanic" /></div>
          </div>
          <div className="space-y-1.5"><label className="text-xs font-medium">Purpose</label><textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} placeholder="One paragraph: why this spec exists." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Status</label>
            <div className="flex flex-wrap gap-1">
              {SPEC_STATUS.map((s) => (
                <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors", status === s ? "border-foreground/30 bg-accent" : "border-border text-muted-foreground hover:border-foreground/20")}>
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: STATUS_COLOR[s] }} />
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <ListField label="Goals" hint="What this spec must achieve." items={goals} onChange={setGoals} />
          <ListField label="Features" hint="Concrete features, one per line." items={features} onChange={setFeatures} />
          <ListField label="Constraints" hint="Hard limits: performance, compatibility, etc." items={constraints} onChange={setConstraints} />
          <ListField label="Dependencies" hint="Standards, notes, or specs required (e.g. std_4, note_7)." items={dependencies} onChange={setDependencies} />
          <ListField label="Acceptance criteria" hint="Testable GIVEN/WHEN/THEN statements." items={acceptance} onChange={setAcceptance} multiline />
          <ListField label="Risks" hint="What could go wrong." items={risks} onChange={setRisks} />
          <ListField label="Future improvements" hint="Out of scope for v1 but worth tracking." items={future} onChange={setFuture} />
          <div className="space-y-1.5"><label className="text-xs font-medium">Technical notes</label><textarea value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} rows={4} placeholder="Architecture approach, algorithms, surface area." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          {spec && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Linked notes: {linkedNoteIds.length}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>Tasks: {existing?.length ?? 0}</span>
              {planForSpec && (<><span className="mx-1 opacity-40">·</span><span>Plan: <Link href={`/specs/${spec.id}`} className="text-primary hover:underline">{planForSpec.status}</Link></span></>)}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-2">
              {spec && (<Button variant="ghost" size="sm" onClick={onDelete} className="gap-1 text-[color:var(--danger)]"><Trash2 className="h-3.5 w-3.5" />Delete</Button>)}
              <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3 text-[color:var(--primary)]" />AI will use this when generating plans and code.</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={onSave} disabled={submitting}>{submitting ? "Saving…" : spec ? "Save changes" : "Create spec"}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cleanList(items: string[]): string[] { return items.map((s) => s.trim()).filter(Boolean); }

function ListField({ label, hint, items, onChange, multiline }: { label: string; hint?: string; items: string[]; onChange: (next: string[]) => void; multiline?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium">{label}</label>
        <Button variant="ghost" size="sm" onClick={() => onChange([...items, ""])} className="gap-1 text-[10px]"><Plus className="h-3 w-3" />Add</Button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      <div className="space-y-1.5">
        {items.map((v, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
            <textarea value={v} onChange={(e) => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))} rows={multiline && v.length > 80 ? 2 : 1} placeholder={multiline ? "GIVEN … WHEN … THEN …" : ""} className="flex-1 resize-y rounded-md border border-border bg-background px-2 py-1 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button type="button" onClick={() => onChange(items.length === 1 ? [""] : items.filter((_, idx) => idx !== i))} className="mt-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-[color:var(--danger)]" aria-label={`Remove ${label}`}><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
