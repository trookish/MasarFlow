"use client";
import * as React from "react";
import Link from "next/link";
import { BookOpen, Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useDocs } from "@/lib/db/repos/misc";
import { formatRelativeTime } from "@/lib/utils";

export default function DocsPage() {
  const project = useActiveProject();
  const docs = useDocs(project?.id);

  return (
    <div className="pb-10">
      <PageHeader
        icon={BookOpen}
        eyebrow="Documentation"
        title="Always up to date"
        description="Auto-generated from specs, code, and architecture. Whenever implementation changes, the related docs update."
        actions={
          <Button className="gap-2">
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
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs?.map((d) => (
            <Link
              key={d.id}
              href={`/docs/${d.id}`}
              className="group block rounded-lg border border-border bg-card p-4 transition-all hover:border-border/80 hover:bg-accent/20"
            >
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
          ))}
        </div>
      </div>
    </div>
  );
}
