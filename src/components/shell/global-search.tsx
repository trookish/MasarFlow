"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useUi } from "@/lib/stores/ui";
import { buildSearchIndex, type SearchHit, type SearchHitKind } from "@/lib/search";
import { Brain, FileText, ListTodo, BookOpen, ScrollText, ShieldCheck, Bot, GitCommit, Boxes } from "lucide-react";

const KIND_ICON: Record<SearchHitKind, React.ComponentType<{ className?: string }>> = {
  note: Brain, spec: FileText, task: ListTodo, doc: BookOpen, devlog: ScrollText,
  standard: ShieldCheck, agent: Bot, commit: GitCommit, system: Boxes,
};

export function GlobalSearch() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<SearchHit[]>([]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setQ(""); setResults([]); return; }
    let mounted = true;
    (async () => {
      setReady(false);
      const idx = await buildSearchIndex();
      if (!mounted) return;
      (idx as unknown as { _ready?: boolean })._ready = true;
      setReady(true);
      setQ("");
    })();
    return () => { mounted = false; };
  }, [open]);

  React.useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    (async () => {
      const idx = await buildSearchIndex();
      const raw = (idx as unknown as { search: (q: string) => Array<{ id: string; type: SearchHitKind; title: string; subtitle: string; href: string; score: number; tags: string[] }> }).search(q);
      setResults(raw.slice(0, 40).map((r) => ({ id: r.id, type: r.type, title: r.title, subtitle: r.subtitle, href: r.href, excerpt: "", score: r.score, tags: r.tags ?? [] })));
    })();
  }, [q]);

  const grouped = React.useMemo(() => {
    const g: Record<string, SearchHit[]> = {};
    results.forEach((h) => { g[h.type] ??= []; g[h.type].push(h); });
    return g;
  }, [results]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={ready ? "Search notes, specs, tasks, docs, standards, agents..." : "Indexing..."} value={q} onValueChange={setQ} autoFocus />
      <CommandList>
        <CommandEmpty>{q.trim() ? "Nothing matches." : "Type to search across the project."}</CommandEmpty>
        {Object.entries(grouped).map(([type, items]) => (
          <CommandGroup key={type} heading={type.toUpperCase()}>
            {items.map((h) => {
              const Icon = KIND_ICON[h.type as SearchHitKind];
              return (
                <CommandItem
                  key={`${type}_${h.id}`}
                  value={`${h.type} ${h.title} ${h.subtitle} ${h.tags.join(" ")}`}
                  onSelect={() => { setOpen(false); router.push(h.href); }}
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{h.title}</span>
                  {h.subtitle && <span className="ml-auto text-[10px] text-muted-foreground">{h.subtitle}</span>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
