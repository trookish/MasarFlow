"use client";
import * as React from "react";
import { Search as SearchIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useNotes } from "@/lib/db/repos/notes";
import { useSpecs } from "@/lib/db/repos/specs";
import { useTasks, useDocs, useDevLogs, useStandards } from "@/lib/db/repos/misc";
import { Brain, FileText, ListTodo, BookOpen, ScrollText, ShieldCheck } from "lucide-react";

type Hit = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
  icon: React.ReactNode;
  score: number;
};

export default function SearchPage() {
  const project = useActiveProject();
  const notes = useNotes(project?.id);
  const specs = useSpecs(project?.id);
  const tasks = useTasks(project?.id);
  const docs = useDocs(project?.id);
  const logs = useDevLogs(project?.id);
  const standards = useStandards(project?.id);
  const [q, setQ] = React.useState("");

  const allHits = React.useMemo<Hit[]>(() => {
    const list: Hit[] = [];
    notes?.forEach((n) =>
      list.push({
        id: n.id,
        type: "note",
        title: n.title,
        subtitle: n.type,
        href: `/brain/${n.id}`,
        icon: <Brain className="h-3.5 w-3.5" />,
        score: 0,
      }),
    );
    specs?.forEach((s) =>
      list.push({
        id: s.id,
        type: "spec",
        title: `${s.number} — ${s.title}`,
        subtitle: s.status,
        href: `/specs/${s.id}`,
        icon: <FileText className="h-3.5 w-3.5" />,
        score: 0,
      }),
    );
    tasks?.forEach((t) =>
      list.push({
        id: t.id,
        type: "task",
        title: t.title,
        subtitle: `${t.status} · ${t.priority}`,
        href: "/tasks",
        icon: <ListTodo className="h-3.5 w-3.5" />,
        score: 0,
      }),
    );
    docs?.forEach((d) =>
      list.push({
        id: d.id,
        type: "doc",
        title: d.title,
        subtitle: d.kind,
        href: `/docs/${d.id}`,
        icon: <BookOpen className="h-3.5 w-3.5" />,
        score: 0,
      }),
    );
    logs?.forEach((l) =>
      list.push({
        id: l.id,
        type: "devlog",
        title: l.title,
        subtitle: l.kind,
        href: "/dev-logs",
        icon: <ScrollText className="h-3.5 w-3.5" />,
        score: 0,
      }),
    );
    standards?.forEach((s) =>
      list.push({
        id: s.id,
        type: "standard",
        title: s.title,
        subtitle: s.category,
        href: `/standards/${s.id}`,
        icon: <ShieldCheck className="h-3.5 w-3.5" />,
        score: 0,
      }),
    );
    return list;
  }, [notes, specs, tasks, docs, logs, standards]);

  const results = React.useMemo<Hit[]>(() => {
    if (!q.trim()) return allHits.slice(0, 20);
    const ql = q.toLowerCase();
    return allHits
      .map((h) => {
        const t = h.title.toLowerCase();
        const s = h.subtitle.toLowerCase();
        let score = 0;
        if (t === ql) score += 100;
        if (t.startsWith(ql)) score += 30;
        if (t.includes(ql)) score += 10;
        if (s.includes(ql)) score += 3;
        if (h.type.includes(ql)) score += 5;
        return { ...h, score };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [allHits, q]);

  const grouped = React.useMemo(() => {
    const g: Record<string, Hit[]> = {};
    results.forEach((h) => {
      g[h.type] ??= [];
      g[h.type].push(h);
    });
    return g;
  }, [results]);

  return (
    <div className="pb-10">
      <PageHeader
        icon={SearchIcon}
        eyebrow="Search"
        title="Semantic search across everything"
        description="Notes, specs, tasks, documentation, architecture, dev logs, and memory — all in one place."
      />

      <div className="px-6 py-5">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search across all modules…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9 text-sm"
          />
        </div>

        <div className="mt-5 space-y-5">
          {Object.entries(grouped).map(([type, items]) => (
            <section key={type}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {type} <span className="ml-1 font-normal opacity-60">({items.length})</span>
              </h2>
              <div className="space-y-1.5">
                {items.map((h) => (
                  <a
                    key={`${type}_${h.id}`}
                    href={h.href}
                    className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5 text-sm transition-colors hover:border-border/80 hover:bg-accent/30"
                  >
                    <span className="text-muted-foreground">{h.icon}</span>
                    <span className="flex-1 truncate">{h.title}</span>
                    <Badge variant="ghost" className="text-[10px]">
                      {h.subtitle}
                    </Badge>
                    {q && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {h.score.toFixed(0)}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </section>
          ))}
          {results.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Nothing matches &ldquo;{q}&rdquo;.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
