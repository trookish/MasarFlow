"use client";
import * as React from "react";
import { useCreateDialogs, setOpenNewStandard } from "@/lib/stores/create-dialogs";
import {
  ShieldCheck,
  Plus,
  Lock,
  Sparkles,
  Pencil,
  Trash2,
  FileDown,
  FileUp,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useStandards } from "@/lib/db/repos/misc";
import { useSpecs } from "@/lib/db/repos/specs";
import { useNotes } from "@/lib/db/repos/notes";
import { StandardEditorDialog } from "@/components/common/standard-editor-dialog";
import { ViolationsPanel } from "@/components/standards/violations-panel";
import { getDb, type Standard, STANDARD_CATEGORIES } from "@/lib/db/schema";
import { computeProjectViolations } from "@/lib/standards/enforcer";
import { z } from "zod";
import { toast } from "sonner";
import { uid } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  naming: "Naming",
  structure: "Structure",
  comments: "Comments",
  patterns: "Patterns",
  performance: "Performance",
  events: "Events",
  di: "Dependency Injection",
  files: "Files",
  unity: "Unity",
  networking: "Networking",
  other: "Other",
};

const standardsImportSchema = z.array(
  z.object({
    id: z.string().min(1).optional(),
    category: z.enum(STANDARD_CATEGORIES),
    title: z.string().min(1),
    rule: z.string(),
    examples: z.array(z.string()).default([]),
    enforced: z.boolean().default(true),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
  }),
);

export default function StandardsPage() {
  const project = useActiveProject();
  const standards = useStandards(project?.id);
  const specs = useSpecs(project?.id);
  const notes = useNotes(project?.id);
  const [editorOpenState, setEditorOpenState] = React.useState(false);
  const [editing, setEditing] = React.useState<Standard | undefined>(undefined);
  const [showResults, setShowResults] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const violations = React.useMemo(() => {
    if (!standards || !specs || !notes) {
      return { total: 0, errors: 0, warnings: 0, bySpec: new Map(), byNote: new Map() };
    }
    return computeProjectViolations(specs, notes, standards);
  }, [standards, specs, notes]);

  const grouped = React.useMemo(() => {
    const g: Record<string, NonNullable<typeof standards>> = {};
    (standards ?? []).forEach((s) => {
      g[s.category] ??= [];
      g[s.category].push(s);
    });
    return g;
  }, [standards]);

  const onNew = () => {
    setEditing(undefined);
    setEditorOpenState(true);
  };

  const onEdit = (s: Standard) => {
    setEditing(s);
    setEditorOpenState(true);
  };

  const onDelete = async (s: Standard) => {
    if (!window.confirm(`Delete standard "${s.title}"?`)) return;
    try {
      await getDb().standards.delete(s.id);
      toast.success("Standard deleted");
    } catch (e) {
      toast.error("Failed to delete", { description: (e as Error).message });
    }
  };

  const onExport = () => {
    if (!standards) return;
    const blob = new Blob([JSON.stringify(standards, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `standards-${project?.slug ?? "project"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Standards exported");
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = standardsImportSchema.parse(parsed);
      const now = Date.now();
      const toAdd: Standard[] = imported.map((s) => ({
        id: s.id ?? uid("std"),
        projectId: project.id,
        category: s.category,
        title: s.title,
        rule: s.rule,
        examples: s.examples,
        enforced: s.enforced,
        createdAt: s.createdAt ?? now,
        updatedAt: s.updatedAt ?? now,
      }));
      await getDb().standards.bulkPut(toAdd);
      toast.success(`Imported ${toAdd.length} standard${toAdd.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error("Import failed", { description: (err as Error).message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openFlag = useCreateDialogs((s) => s.standard);
  const editorOpen = editorOpenState || openFlag;
  const setEditorOpen = (v: boolean) => {
    setEditorOpenState(v);
    if (!v) setOpenNewStandard(false);
  };

  return (
    <div className="pb-10">
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Standards"
        title="Your development philosophy"
        description="Permanent project rules. Every AI action follows these. Code you generate should look like you wrote it."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onExport}>
              <FileDown className="h-3.5 w-3.5" /> Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-3.5 w-3.5" /> Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={onImport}
            />
            <Button
              variant="soft"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowResults((v) => !v)}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Check standards
            </Button>
            <Button className="gap-2" onClick={onNew}>
              <Plus className="h-4 w-4" /> New standard
            </Button>
          </div>
        }
      />

      <div className="space-y-5 px-6 py-5">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="bg-accent grid h-8 w-8 place-items-center rounded-md">
              <Sparkles className="h-4 w-4 text-[color:var(--primary)]" />
            </span>
            <div className="flex-1 text-sm">
              <div className="font-medium">AI always follows your standards</div>
              <p className="text-muted-foreground text-pretty">
                Standards are injected into every AI context retrieval, ensuring generated code
                matches your conventions.
              </p>
            </div>
            <Badge variant="success">Enforced</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardDescription className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--warning)]" />
                Violations
              </CardDescription>
              <CardTitle className="mt-1 text-sm">Project-wide standards check</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {violations.total > 0 ? (
                <>
                  <Badge variant="danger" className="text-[10px]">
                    {violations.errors} errors
                  </Badge>
                  <Badge variant="warning" className="text-[10px]">
                    {violations.warnings} warnings
                  </Badge>
                </>
              ) : (
                <Badge variant="success" className="text-[10px]">
                  Clean
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground text-xs">
              {violations.total === 0 ? (
                <span>
                  No violations across {specs?.length ?? 0} specs and {notes?.length ?? 0} notes.
                </span>
              ) : (
                <span>
                  Found {violations.total} violation{violations.total === 1 ? "" : "s"} across{" "}
                  {specs?.length ?? 0} specs and {notes?.length ?? 0} notes.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {showResults && violations.total > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Check results</CardTitle>
              <CardDescription>
                {violations.total} violation{violations.total === 1 ? "" : "s"} found
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {specs?.map((spec) => {
                const list = violations.bySpec.get(spec.id) ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={spec.id}>
                    <div className="mb-1.5 text-xs font-medium">
                      Spec: <span className="text-foreground">{spec.title}</span>
                    </div>
                    <ViolationsPanel violations={list} title="" />
                  </div>
                );
              })}
              {notes?.map((note) => {
                const list = violations.byNote.get(note.id) ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={note.id}>
                    <div className="mb-1.5 text-xs font-medium">
                      Note: <span className="text-foreground">{note.title}</span>
                    </div>
                    <ViolationsPanel violations={list} title="" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {Object.entries(grouped).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
              {CATEGORY_LABELS[cat] ?? cat}
              <span className="ml-2 font-normal opacity-60">{items.length}</span>
            </h2>
            <div className="space-y-2">
              {items.map((s) => (
                <Card key={s.id} className="group hover:border-border/80 transition-colors">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm">{s.title}</CardTitle>
                      <CardDescription className="mt-0.5">{s.rule}</CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit(s)}
                        aria-label="Edit standard"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onDelete(s)}
                        aria-label="Delete standard"
                        className="text-muted-foreground hover:text-[color:var(--danger)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {s.enforced ? (
                      <Badge variant="success" className="ml-2 gap-1">
                        <Lock className="h-3 w-3" />
                        Enforced
                      </Badge>
                    ) : (
                      <Badge variant="ghost" className="ml-2">
                        Suggested
                      </Badge>
                    )}
                  </CardHeader>
                  {s.examples.length > 0 && (
                    <CardContent className="space-y-1.5 pt-0">
                      {s.examples.map((e, i) => (
                        <pre
                          key={i}
                          className="border-border bg-surface-2 overflow-x-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed"
                        >
                          <code>{e}</code>
                        </pre>
                      ))}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </section>
        ))}

        {standards && standards.length === 0 && (
          <Card>
            <CardContent className="text-muted-foreground p-10 text-center text-sm">
              No standards yet. Click <strong>New standard</strong> to add your first rule.
            </CardContent>
          </Card>
        )}
      </div>

      <StandardEditorDialog open={editorOpen} onOpenChange={setEditorOpen} standard={editing} />
    </div>
  );
}
