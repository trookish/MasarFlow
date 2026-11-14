"use client";
import * as React from "react";
import Link from "next/link";
import { Search as SearchIcon, Sparkles, Tag } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useNotes } from "@/lib/db/repos/notes";
import { useSpecs } from "@/lib/db/repos/specs";
import { useTasks, useDocs, useDevLogs, useStandards } from "@/lib/db/repos/misc";
import {
  Brain,
  FileText,
  ListTodo,
  BookOpen,
  ScrollText,
  ShieldCheck,
  Bot,
  GitCommit,
  Boxes,
} from "lucide-react";
import { buildSearchIndex, type SearchHit, type SearchHitKind } from "@/lib/search";
import type MiniSearch from "minisearch";

const KIND_ICON: Record<SearchHitKind, React.ComponentType<{ className?: string }>> = {
  note: Brain,
  spec: FileText,
  task: ListTodo,
  doc: BookOpen,
  devlog: ScrollText,
  standard: ShieldCheck,
  agent: Bot,
  commit: GitCommit,
  system: Boxes,
};

const KIND_COLOR: Record<SearchHitKind, string> = {
  note: "var(--graph-note)",
  spec: "var(--graph-spec)",
  task: "var(--graph-task)",
  doc: "var(--graph-doc)",
  devlog: "var(--graph-memory)",
  standard: "var(--graph-standard)",
  agent: "var(--graph-memory)",
  commit: "var(--graph-commit)",
  system: "var(--graph-system)",
};

const KIND_LABEL: Record<SearchHitKind, string> = {
  note: "Note",
  spec: "Spec",
  task: "Task",
  doc: "Doc",
  devlog: "Dev log",
  standard: "Standard",
  agent: "Agent",
  commit: "Commit",
  system: "System",
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
  const [index, setIndex] = React.useState<MiniSearch<unknown> | null>(null);
  const [building, setBuilding] = React.useState(false);
  const [activeKind, setActiveKind] = React.useState<SearchHitKind | "all">("all");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (notes && specs && tasks && docs && logs && standards) {
        setBuilding(true);
        const idx = await buildSearchIndex();
        if (mounted) {
          setIndex(idx as unknown as MiniSearch<unknown>);
          setBuilding(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [notes, specs, tasks, docs, logs, standards]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = React.useMemo(() => {
    if (!index || !q.trim()) return [];
    const raw = (
      index as unknown as {
        search: (
          q: string,
          opts?: unknown,
        ) => Array<{
          id: string;
          type: SearchHitKind;
          title: string;
          subtitle: string;
          href: string;
          tags: string[];
          score: number;
        }>;
      }
    ).search(q, { combineWith: "AND" });
    return raw.slice(0, 60).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      subtitle: r.subtitle,
      excerpt: "",
      href: r.href,
      score: r.score,
      tags: r.tags ?? [],
    }));
  }, [q, index]);

  const filtered = React.useMemo(() => {
    if (activeKind === "all") return results;
    return results.filter((r) => r.type === activeKind);
  }, [results, activeKind]);

  const grouped = React.useMemo(() => {
    const g: Record<string, SearchHit[]> = {};
    filtered.forEach((h) => {
      g[h.type] ??= [];
      g[h.type].push(h);
    });
    return g;
  }, [filtered]);

  const kindCounts = React.useMemo(() => {
    const c: Record<string, number> = { all: results.length };
    results.forEach((h) => {
      c[h.type] = (c[h.type] ?? 0) + 1;
    });
    return c;
  }, [results]);

  return (
    <div className="pb-10">
      <PageHeader
        icon={SearchIcon}
        eyebrow="Search"
        title="Semantic search across everything"
        description="Notes, specs, tasks, documentation, architecture, dev logs, standards, agents, commits. Indexed and ranked."
      />
      <div className="px-6 py-5">
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-3.5 left-3 h-4 w-4" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search across all modules..."
            className="border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border pr-3 pl-9 text-sm outline-none focus-visible:ring-2"
          />
          {building && (
            <span className="text-muted-foreground absolute top-3 right-3 text-[10px]">
              indexing...
            </span>
          )}
        </div>

        {q.trim() && results.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
              Filter:
            </span>
            <FilterChip
              k="all"
              active={activeKind}
              onClick={() => setActiveKind("all")}
              count={kindCounts.all ?? 0}
            />
            {(Object.keys(KIND_LABEL) as SearchHitKind[]).map((k) =>
              kindCounts[k] ? (
                <FilterChip
                  key={k}
                  k={k}
                  active={activeKind}
                  onClick={() => setActiveKind(k)}
                  count={kindCounts[k] ?? 0}
                />
              ) : null,
            )}
          </div>
        )}

        <div className="mt-5 space-y-5">
          {!q.trim() && (
            <Card>
              <CardContent className="text-muted-foreground p-10 text-center text-sm">
                <Sparkles className="mx-auto mb-2 h-6 w-6 text-[color:var(--primary)]" />
                Try: <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">climb</code>
                , <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">save</code>,{" "}
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">dispatcher</code>
                , or <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">unity</code>
                .
              </CardContent>
            </Card>
          )}
          {q.trim() && results.length === 0 && !building && (
            <Card>
              <CardContent className="text-muted-foreground p-10 text-center text-sm">
                No results for &ldquo;{q}&rdquo;.
              </CardContent>
            </Card>
          )}
          {Object.entries(grouped).map(([type, items]) => (
            <section key={type}>
              <h2 className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: KIND_COLOR[type as SearchHitKind] }}
                />
                {KIND_LABEL[type as SearchHitKind]}
                <span className="font-normal opacity-60">({items.length})</span>
              </h2>
              <div className="space-y-1.5">
                {items.map((h) => {
                  const I = KIND_ICON[h.type];
                  return (
                    <Link
                      key={`${h.type}_${h.id}`}
                      href={h.href}
                      className="border-border bg-card hover:border-border/80 hover:bg-accent/30 flex items-center gap-3 rounded-md border p-2.5 text-sm transition-colors"
                    >
                      <span className="text-muted-foreground">
                        <I className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{h.title}</div>
                        {h.tags.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {h.tags.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                className="bg-muted text-muted-foreground inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px]"
                              >
                                <Tag className="h-2 w-2" />
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-muted-foreground text-[10px]">{h.subtitle}</span>
                      <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                        {h.score.toFixed(1)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  k,
  active,
  onClick,
  count,
}: {
  k: SearchHitKind | "all";
  active: SearchHitKind | "all";
  onClick: () => void;
  count: number;
}) {
  const label = k === "all" ? "All" : KIND_LABEL[k as SearchHitKind];
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] transition-colors " +
        (active === k
          ? "border-foreground/30 bg-accent"
          : "border-border text-muted-foreground hover:border-foreground/20")
      }
    >
      {label}
      <span className="font-mono opacity-60">{count}</span>
    </button>
  );
}
