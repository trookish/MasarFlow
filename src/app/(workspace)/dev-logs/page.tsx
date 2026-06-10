"use client";
import * as React from "react";
import { ScrollText, GitCommit, Sparkles, Plus, Filter, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DevLogKindBadge } from "@/components/common/badges";
import { DevLogComposer } from "@/components/common/dev-log-composer";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useDevLogs, useCommits } from "@/lib/db/repos/misc";
import { getDb, DEVLOG_KINDS, type DevLogKind } from "@/lib/db/schema";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function DevLogsPage() {
  const project = useActiveProject();
  const logs = useDevLogs(project?.id);
  const commits = useCommits(project?.id);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<DevLogKind | "all">("all");

  const visibleLogs = (logs ?? []).filter((l) => filter === "all" || l.kind === filter);

  const items = [
    ...visibleLogs.map((l) => ({
      kind: "log" as const,
      id: l.id,
      title: l.title,
      body: l.body,
      ts: l.createdAt,
      subKind: l.kind,
      badge: <DevLogKindBadge kind={l.kind} />,
    })),
    ...(commits?.map((c) => ({
      kind: "commit" as const,
      id: c.id,
      title: c.message,
      body: c.aiSummary ?? c.files.join("\n"),
      ts: c.date,
      subKind: "commit" as DevLogKind | "commit",
      badge: (
        <Badge variant="ghost" className="font-mono text-[10px]">
          <GitCommit className="h-3 w-3" /> {c.hash}
        </Badge>
      ),
    })) ?? []),
  ].sort((a, b) => b.ts - a.ts);

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this dev log?")) return;
    await getDb().devLogs.delete(id);
    toast.success("Dev log deleted");
  };

  return (
    <div className="pb-10">
      <PageHeader
        icon={ScrollText}
        eyebrow="Dev Logs"
        title="Long-term project memory"
        description="A chronological timeline of features, refactors, decisions, lessons, failures, and successes."
        actions={
          <Button className="gap-2" onClick={() => setComposerOpen(true)}>
            <Plus className="h-4 w-4" /> New log
          </Button>
        }
      />

      <div className="border-b border-border px-6">
        <div className="flex items-center gap-3 py-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <button
            onClick={() => setFilter("all")}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", filter === "all" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40")}
          >
            All
          </button>
          {DEVLOG_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors", filter === k ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40")}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        <Card className="mb-4">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent">
              <Sparkles className="h-4 w-4 text-[color:var(--primary)]" />
            </span>
            <div className="flex-1 text-sm">
              <div className="font-medium">AI-curated</div>
              <p className="text-muted-foreground text-pretty">
                AI agents post dev logs automatically when they make decisions or learn lessons. You can also log manually.
              </p>
            </div>
          </CardContent>
        </Card>

        <ol className="relative space-y-4 border-l border-border pl-6">
          {items.map((it) => (
            <li key={`${it.kind}_${it.id}`} className="group relative">
              <span
                className={cn(
                  "absolute -left-[1.6rem] top-1.5 grid h-3 w-3 place-items-center rounded-full ring-4 ring-background",
                  it.kind === "commit" ? "bg-[color:var(--graph-commit)]" : "bg-[color:var(--primary)]",
                )}
              />
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-1 flex items-center gap-2">
                  {it.badge}
                  <span className="ml-auto text-[10px] text-muted-foreground">{formatRelativeTime(it.ts)}</span>
                </div>
                <h3 className="text-sm font-semibold leading-snug">{it.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground text-pretty">{it.body}</p>
                {it.kind === "log" && (
                  <button
                    onClick={() => onDelete(it.id)}
                    className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-[color:var(--danger)] group-hover:opacity-100"
                    aria-label="Delete log"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No logs match the current filter. Click <strong>New log</strong> to add one.
            </li>
          )}
        </ol>
      </div>

      <DevLogComposer open={composerOpen} onOpenChange={setComposerOpen} />
    </div>
  );
}
