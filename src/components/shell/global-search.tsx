"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useUi } from "@/lib/stores/ui";
import { useNotes } from "@/lib/db/repos/notes";
import { useSpecs } from "@/lib/db/repos/specs";
import { useTasks, useDocs, useDevLogs, useStandards } from "@/lib/db/repos/misc";
import { useActiveProject } from "@/lib/db/repos/projects";
import { FileText, Brain, ListTodo, BookOpen, ScrollText, ShieldCheck } from "lucide-react";

type AnyHit = { id: string; type: string; title: string; subtitle?: string; href: string; icon: React.ReactNode };

export function GlobalSearch() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const project = useActiveProject();
  const notes = useNotes(project?.id);
  const specs = useSpecs(project?.id);
  const tasks = useTasks(project?.id);
  const docs = useDocs(project?.id);
  const devLogs = useDevLogs(project?.id);
  const standards = useStandards(project?.id);
  const router = useRouter();
  const [q, setQ] = React.useState("");

  const allHits = React.useMemo<AnyHit[]>(() => {
    const hits: AnyHit[] = [];
    notes?.forEach((n) =>
      hits.push({
        id: n.id,
        type: "note",
        title: n.title,
        subtitle: n.type,
        href: `/brain/${n.id}`,
        icon: <Brain className="h-3.5 w-3.5" />,
      }),
    );
    specs?.forEach((s) =>
      hits.push({
        id: s.id,
        type: "spec",
        title: `${s.number} — ${s.title}`,
        subtitle: s.status,
        href: `/specs/${s.id}`,
        icon: <FileText className="h-3.5 w-3.5" />,
      }),
    );
    tasks?.forEach((t) =>
      hits.push({
        id: t.id,
        type: "task",
        title: t.title,
        subtitle: `${t.status} · ${t.priority}`,
        href: `/tasks`,
        icon: <ListTodo className="h-3.5 w-3.5" />,
      }),
    );
    docs?.forEach((d) =>
      hits.push({
        id: d.id,
        type: "doc",
        title: d.title,
        subtitle: d.kind,
        href: `/docs/${d.id}`,
        icon: <BookOpen className="h-3.5 w-3.5" />,
      }),
    );
    devLogs?.forEach((d) =>
      hits.push({
        id: d.id,
        type: "devlog",
        title: d.title,
        subtitle: d.kind,
        href: `/dev-logs`,
        icon: <ScrollText className="h-3.5 w-3.5" />,
      }),
    );
    standards?.forEach((s) =>
      hits.push({
        id: s.id,
        type: "standard",
        title: s.title,
        subtitle: s.category,
        href: `/standards/${s.id}`,
        icon: <ShieldCheck className="h-3.5 w-3.5" />,
      }),
    );
    return hits;
  }, [notes, specs, tasks, docs, devLogs, standards]);

  const filtered = React.useMemo(() => {
    if (!q.trim()) return allHits.slice(0, 12);
    const ql = q.toLowerCase();
    return allHits
      .filter(
        (h) =>
          h.title.toLowerCase().includes(ql) || h.type.includes(ql) || (h.subtitle ?? "").includes(ql),
      )
      .slice(0, 30);
  }, [allHits, q]);

  const grouped = React.useMemo(() => {
    const g: Record<string, AnyHit[]> = {};
    filtered.forEach((h) => {
      g[h.type] ??= [];
      g[h.type].push(h);
    });
    return g;
  }, [filtered]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search notes, specs, tasks, docs, dev logs…"
        autoFocus
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        <CommandEmpty>Nothing matches “{q}”.</CommandEmpty>
        {Object.entries(grouped).map(([type, items]) => (
          <CommandGroup key={type} heading={type.toUpperCase()}>
            {items.map((h) => (
              <CommandItem
                key={`${type}_${h.id}`}
                value={`${type} ${h.title} ${h.subtitle ?? ""}`}
                onSelect={() => {
                  setOpen(false);
                  router.push(h.href);
                }}
              >
                <span className="text-muted-foreground">{h.icon}</span>
                <span className="truncate">{h.title}</span>
                {h.subtitle && (
                  <span className="ml-auto text-[10px] text-muted-foreground">{h.subtitle}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
