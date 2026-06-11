"use client";
import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Link2, GitBranch, Boxes, Lightbulb, ArrowRight, ScrollText } from "lucide-react";
import { useUi } from "@/lib/stores/ui";
import { useActiveProject } from "@/lib/db/repos/projects";
import { usePathname } from "next/navigation";
import { useMemories, useTasks, useSystems, useArchGraph, useDevLogs } from "@/lib/db/repos/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn, formatRelativeTime } from "@/lib/utils";

interface RightRailPanel {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

function AiSuggestionsPanel() {
  const project = useActiveProject();
  const memories = useMemories(project?.id);
  const topMemories = React.useMemo(
    () => memories?.slice().sort((a, b) => b.weight - a.weight).slice(0, 3) ?? [],
    [memories],
  );

  return (
    <div className="space-y-2">
      {topMemories.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          AI will surface memory hints here as the project grows.
        </div>
      )}
      {topMemories.map((m) => (
        <div
          key={m.id}
          className="rounded-md border border-border bg-surface-2 p-2.5 text-xs"
        >
          <div className="mb-1 flex items-center gap-1.5">
            <Badge variant={m.kind === "decision" ? "info" : m.kind === "lesson" ? "warning" : "secondary"}>
              {m.kind}
            </Badge>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {Math.round(m.weight * 100)}%
            </span>
          </div>
          <p className="text-pretty text-foreground/90">{m.content}</p>
        </div>
      ))}
    </div>
  );
}

function ContextPanel() {
  const project = useActiveProject();
  const tasks = useTasks(project?.id);
  const inProgress = tasks?.filter((t) => t.status === "in_progress").slice(0, 3) ?? [];

  return (
    <div className="space-y-1.5">
      {inProgress.length === 0 ? (
        <div className="text-xs text-muted-foreground">Nothing in progress.</div>
      ) : (
        inProgress.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2 text-xs"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--info)]" />
            <span className="flex-1 truncate">{t.title}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{t.progress}%</span>
          </div>
        ))
      )}
    </div>
  );
}

function ArchitectureImpactPanel() {
  const items = [
    { label: "Climbing (in progress)", impact: "moderate", refs: 3 },
    { label: "Memory Echoes (review)", impact: "low", refs: 2 },
    { label: "Audio culling (shipped)", impact: "low", refs: 1 },
  ];
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div
          key={i.label}
          className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2 text-xs"
        >
          <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 truncate">{i.label}</span>
          <Badge variant={i.impact === "moderate" ? "warning" : "ghost"}>{i.impact}</Badge>
        </div>
      ))}
    </div>
  );
}

function MemoryReferencesPanel() {
  const items = [
    "ADR-007: state dispatcher",
    "Standard 4: no allocations in Update",
    "Standard 5: events are Action / Func",
  ];
  return (
    <div className="space-y-1">
      {items.map((s) => (
        <div
          key={s}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent/40"
        >
          <Link2 className="h-3 w-3" />
          <span className="truncate">{s}</span>
          <ArrowRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      ))}
    </div>
  );
}

const PANELS: RightRailPanel[] = [
  {
    id: "ai",
    title: "AI Suggestions",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    content: <AiSuggestionsPanel />,
  },
  {
    id: "ctx",
    title: "Context",
    icon: <GitBranch className="h-3.5 w-3.5" />,
    content: <ContextPanel />,
  },
  {
    id: "arch",
    title: "Architecture Impact",
    icon: <Boxes className="h-3.5 w-3.5" />,
    content: <ArchitectureImpactPanel />,
  },
  {
    id: "dev",
    title: "Recent dev logs",
    icon: <ScrollText className="h-3.5 w-3.5" />,
    content: <RecentDevPanel />,
  },
  {
    id: "mem",
    title: "Memory References",
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    content: <MemoryReferencesPanel />,
  },
];

function RecentDevPanel() {
  const project = useActiveProject();
  const devLogs = useDevLogs(project?.id);
  const recentDev = devLogs?.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 4) ?? [];
  return (
    <div className="space-y-1.5">
      {recentDev.length === 0 ? (
        <div className="text-xs text-muted-foreground">No dev logs yet.</div>
      ) : (
        recentDev.map((d) => (
          <div key={d.id} className="rounded-md border border-border/60 bg-surface-2 p-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] capitalize">{d.kind}</Badge>
              <span className="ml-auto text-[10px] text-muted-foreground">{formatRelativeTime(d.createdAt)}</span>
            </div>
            <div className="mt-1 text-pretty leading-snug">{d.title}</div>
            {d.body && <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{d.body}</div>}
          </div>
        ))
      )}
    </div>
  );
}

export function RightRail() {
  const collapsed = useUi((s) => s.rightRailCollapsed);
  const pathname = usePathname();
  void pathname;

  return (
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.aside
          key="right-rail"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="relative z-10 hidden h-full shrink-0 overflow-hidden border-l border-border bg-background lg:flex lg:flex-col"
        >
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Context
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-5 p-4">
              {PANELS.map((p, idx) => (
                <section key={p.id} className={cn(idx > 0 && "")}>
                  <header className="mb-2 flex items-center gap-2">
                    <span className="text-muted-foreground">{p.icon}</span>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {p.title}
                    </h3>
                  </header>
                  {p.content}
                  {idx < PANELS.length - 1 && <Separator className="mt-4" />}
                </section>
              ))}
            </div>
          </ScrollArea>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
