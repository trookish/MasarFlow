"use client";
import * as React from "react";
import Link from "next/link";
import { Brain, Plus, Search, Folder, Hash, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NoteTypeBadge } from "@/components/common/badges";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useNotes } from "@/lib/db/repos/notes";
import { useFolders, useTags } from "@/lib/db/repos/misc";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TYPE_ACCENT: Record<string, string> = {
  idea: "var(--graph-idea)",
  system: "var(--graph-system)",
  mechanic: "var(--graph-task)",
  research: "var(--graph-doc)",
  experiment: "var(--graph-arch)",
  note: "var(--graph-note)",
  lore: "var(--graph-memory)",
  decision: "var(--graph-spec)",
};

export default function BrainPage() {
  const project = useActiveProject();
  const notes = useNotes(project?.id);
  const folders = useFolders(project?.id);
  const tags = useTags();
  const [q, setQ] = React.useState("");
  const [activeFolder, setActiveFolder] = React.useState<string | null>(null);
  const [activeTag, setActiveTag] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    return (notes ?? []).filter((n) => {
      if (activeFolder && n.folderId !== activeFolder) return false;
      if (activeTag && !n.tags.includes(activeTag)) return false;
      if (q && !`${n.title} ${n.body} ${n.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [notes, q, activeFolder, activeTag]);

  return (
    <div className="pb-10">
      <PageHeader
        icon={Brain}
        eyebrow="Brain"
        title="Permanent project memory"
        description="Ideas, systems, mechanics, research, decisions, and lore. Every note links bidirectionally to specs, tasks, architecture, and code."
        actions={
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> New note
          </Button>
        }
      />

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <aside className="space-y-4 lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Browse</CardDescription>
              <CardTitle className="mt-1 text-sm">Folders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <button
                onClick={() => setActiveFolder(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  activeFolder === null
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/40",
                )}
              >
                <Folder className="h-3.5 w-3.5" /> All
                <span className="ml-auto text-[10px]">{notes?.length ?? 0}</span>
              </button>
              {folders?.map((f) => {
                const count = notes?.filter((n) => n.folderId === f.id).length ?? 0;
                return (
                  <button
                    key={f.id}
                    onClick={() => setActiveFolder(f.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      activeFolder === f.id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/40",
                    )}
                  >
                    <Folder className="h-3.5 w-3.5" /> {f.name}
                    <span className="ml-auto text-[10px]">{count}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Filter</CardDescription>
              <CardTitle className="mt-1 text-sm">Tags</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {tags?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTag(activeTag === t.name ? null : t.name)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                    activeTag === t.name
                      ? "border-foreground/30 bg-foreground/10"
                      : "border-border text-muted-foreground hover:border-foreground/30",
                  )}
                >
                  <Hash className="h-2.5 w-2.5" /> {t.name}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Coming in S2</CardDescription>
              <CardTitle className="mt-1 text-sm">Canvas & backlinks</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Visual canvas, backlinks panel, templates, and full markdown editing ship in session 2.
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-3 lg:col-span-9">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search notes…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((n) => (
              <Link
                key={n.id}
                href={`/brain/${n.id}`}
                className="group relative flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-all hover:border-border/80 hover:bg-accent/20"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: TYPE_ACCENT[n.type] }}
                  />
                  <NoteTypeBadge type={n.type} />
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatRelativeTime(n.updatedAt)}
                  </span>
                </div>
                <h3 className="text-sm font-semibold leading-snug">{n.title}</h3>
                <p className="line-clamp-3 text-xs text-muted-foreground text-pretty">{n.excerpt}</p>
                {n.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {n.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <ArrowRight className="absolute right-3 top-3 h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No notes match this filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
