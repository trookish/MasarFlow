"use client";
import * as React from "react";
import { useCreateDialogs, setOpenNewStandard } from "@/lib/stores/create-dialogs";
import { ShieldCheck, Plus, Lock, Sparkles, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useStandards } from "@/lib/db/repos/misc";
import { StandardEditorDialog } from "@/components/common/standard-editor-dialog";
import { getDb, type Standard } from "@/lib/db/schema";
import { toast } from "sonner";

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

export default function StandardsPage() {
  const project = useActiveProject();
  const standards = useStandards(project?.id);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Standard | undefined>(undefined);

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
    setEditorOpen(true);
  };

  const onEdit = (s: Standard) => {
    setEditing(s);
    setEditorOpen(true);
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

  const openFlag = useCreateDialogs((s) => s.standard);
  React.useEffect(() => {
    if (openFlag) {
      setOpenNewStandard(false);
      setEditorOpen(true);
    }
  }, [openFlag]);


  return (
    <div className="pb-10">
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Standards"
        title="Your development philosophy"
        description="Permanent project rules. Every AI action follows these. Code you generate should look like you wrote it."
        actions={
          <Button className="gap-2" onClick={onNew}>
            <Plus className="h-4 w-4" /> New standard
          </Button>
        }
      />

      <div className="space-y-5 px-6 py-5">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent">
              <Sparkles className="h-4 w-4 text-[color:var(--primary)]" />
            </span>
            <div className="flex-1 text-sm">
              <div className="font-medium">AI always follows your standards</div>
              <p className="text-muted-foreground text-pretty">
                Standards are injected into every AI context retrieval, ensuring generated code matches your conventions.
              </p>
            </div>
            <Badge variant="success">Enforced</Badge>
          </CardContent>
        </Card>

        {Object.entries(grouped).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[cat] ?? cat}
              <span className="ml-2 font-normal opacity-60">{items.length}</span>
            </h2>
            <div className="space-y-2">
              {items.map((s) => (
                <Card key={s.id} className="group transition-colors hover:border-border/80">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm">{s.title}</CardTitle>
                      <CardDescription className="mt-0.5">{s.rule}</CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon-sm" onClick={() => onEdit(s)} aria-label="Edit standard">
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
                          className="overflow-x-auto rounded-md border border-border bg-surface-2 p-2 font-mono text-[11px] leading-relaxed"
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
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No standards yet. Click <strong>New standard</strong> to add your first rule.
            </CardContent>
          </Card>
        )}
      </div>

      <StandardEditorDialog open={editorOpen} onOpenChange={setEditorOpen} standard={editing} />
    </div>
  );
}
