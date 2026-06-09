"use client";
import * as React from "react";
import { ShieldCheck, Plus, Lock, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useStandards } from "@/lib/db/repos/misc";
import { cn } from "@/lib/utils";

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

  const grouped = React.useMemo(() => {
    const g: Record<string, typeof standards> = {} as never;
    (standards ?? []).forEach((s) => {
      g[s.category] ??= [] as never;
      g[s.category].push(s as never);
    });
    return g;
  }, [standards]);

  return (
    <div className="pb-10">
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Standards"
        title="Your development philosophy"
        description="Permanent project rules. Every AI action follows these. Code you generate should look like you wrote it."
        actions={
          <Button className="gap-2">
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
            </h2>
            <div className="space-y-2">
              {(items as NonNullable<typeof standards>).map((s) => (
                <Card key={s.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-sm">{s.title}</CardTitle>
                      <CardDescription className="mt-0.5">{s.rule}</CardDescription>
                    </div>
                    {s.enforced ? (
                      <Badge variant="success" className="gap-1">
                        <Lock className="h-3 w-3" /> Enforced
                      </Badge>
                    ) : (
                      <Badge variant="ghost">Suggested</Badge>
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
      </div>
    </div>
  );
}
