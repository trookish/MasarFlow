"use client";
import * as React from "react";
import Link from "next/link";
import { BookOpen, Plus, Sparkles, Pencil, Trash2, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocEditorDialog } from "@/components/common/doc-editor-dialog";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useDocs } from "@/lib/db/repos/misc";
import { getDb, type Doc } from "@/lib/db/schema";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

export default function DocsPage() {
  const project = useActiveProject();
  const docs = useDocs(project?.id);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Doc | undefined>(undefined);

  const onNew = () => {
    setEditing(undefined);
    setEditorOpen(true);
  };
  const onEdit = (d: Doc) => {
    setEditing(d);
    setEditorOpen(true);
  };
  const onDelete = async (d: Doc) => {
    if (!window.confirm(`Delete doc "${d.title}"?`)) return;
    await getDb().docs.delete(d.id);
    toast.success("Doc deleted");
  };

  return (
    <div className="pb-10">
      <PageHeader
        icon={BookOpen}
        eyebrow="Documentation"
        title="Always up to date"
        description="Auto-generated from specs, code, and architecture. Whenever implementation changes, the related docs update."
        actions={
          <Button className="gap-2" onClick={onNew}>
            <Plus className="h-4 w-4" /> New doc
          </Button>
        }
      />

      <div className="px-6 py-5">
        <Card className="mb-4">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent">
              <Sparkles className="h-4 w-4 text-[color:var(--primary)]" />
            </span>
            <div className="flex-1 text-sm">
              <div className="font-medium">Auto-maintained</div>
              <p className="text-muted-foreground text-pretty">
                Docs in MasarFlow never go stale. They regenerate from the source — specs, code, and architecture.
              </p>
            </div>
            <Badge variant="success" className="gap-1">
              <Wand2 className="h-3 w-3" /> Auto-sync on
            </Badge>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs?.map((d) => (
            <div
              key={d.id}
              className="group relative rounded-lg border border-border bg-card p-4 transition-all hover:border-border/80 hover:bg-accent/20"
            >
              <Link href={`/docs/${d.id}`} className="block">
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">{d.kind}</Badge>
                  {d.generatedFrom && (
                    <Badge variant="ghost" className="font-mono text-[10px]">
                      from {d.generatedFrom}
                    </Badge>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatRelativeTime(d.updatedAt)}
                  </span>
                </div>
                <h3 className="text-sm font-semibold leading-snug">{d.title}</h3>
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground text-pretty">
                  {d.body.slice(0, 180)}
                </p>
              </Link>
              <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button variant="ghost" size="icon-sm" onClick={() => onEdit(d)} aria-label="Edit doc">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(d)}
                  aria-label="Delete doc"
                  className="text-muted-foreground hover:text-[color:var(--danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {docs && docs.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                No docs yet. Click <strong>New doc</strong> to start writing, or auto-stub from a spec.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <DocEditorDialog open={editorOpen} onOpenChange={setEditorOpen} doc={editing} />
    </div>
  );
}
