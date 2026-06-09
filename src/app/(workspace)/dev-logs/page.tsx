"use client";
import * as React from "react";
import { ScrollText, GitCommit, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DevLogKindBadge } from "@/components/common/badges";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useDevLogs, useCommits } from "@/lib/db/repos/misc";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function DevLogsPage() {
  const project = useActiveProject();
  const logs = useDevLogs(project?.id);
  const commits = useCommits(project?.id);

  const items = [
    ...(logs?.map((l) => ({
      kind: "log" as const,
      id: l.id,
      title: l.title,
      body: l.body,
      ts: l.createdAt,
      badge: <DevLogKindBadge kind={l.kind} />,
    })) ?? []),
    ...(commits?.map((c) => ({
      kind: "commit" as const,
      id: c.id,
      title: c.message,
      body: c.aiSummary ?? c.files.join("\n"),
      ts: c.date,
      badge: (
        <Badge variant="ghost" className="font-mono text-[10px]">
          <GitCommit className="h-3 w-3" /> {c.hash}
        </Badge>
      ),
    })) ?? []),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="pb-10">
      <PageHeader
        icon={ScrollText}
        eyebrow="Dev Logs"
        title="Long-term project memory"
        description="A chronological timeline of features, refactors, decisions, lessons, failures, and successes."
      />

      <div className="px-6 py-5">
        <Card className="mb-4">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent">
              <Sparkles className="h-4 w-4 text-[color:var(--primary)]" />
            </span>
            <div className="flex-1 text-sm">
              <div className="font-medium">AI-curated</div>
              <p className="text-muted-foreground text-pretty">
                AI agents post dev logs automatically when they make decisions or learn lessons. You can also
                log manually.
              </p>
            </div>
          </CardContent>
        </Card>

        <ol className="relative space-y-4 border-l border-border pl-6">
          {items.map((it) => (
            <li key={`${it.kind}_${it.id}`} className="relative">
              <span
                className={cn(
                  "absolute -left-[1.6rem] top-1.5 grid h-3 w-3 place-items-center rounded-full ring-4 ring-background",
                  it.kind === "commit"
                    ? "bg-[color:var(--graph-commit)]"
                    : "bg-[color:var(--primary)]",
                )}
              />
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-1 flex items-center gap-2">
                  {it.badge}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatRelativeTime(it.ts)}
                  </span>
                </div>
                <h3 className="text-sm font-semibold leading-snug">{it.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground text-pretty">
                  {it.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
