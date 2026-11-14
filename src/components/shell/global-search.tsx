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
import { buildSearchIndex, type SearchHit, type SearchHitKind } from "@/lib/search";
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

export function GlobalSearch() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [index, setIndex] = React.useState<unknown | null>(null);
  const [ready, setReady] = React.useState(false);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQ("");
  };

  React.useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      setReady(false);
      const idx = await buildSearchIndex();
      if (!mounted) return;
      (idx as unknown as { _ready?: boolean })._ready = true;
      setIndex(idx);
      setReady(true);
      setQ("");
    })();
    return () => {
      mounted = false;
    };
  }, [open]);

  const results = React.useMemo(() => {
    if (!index || !q.trim()) return [];
    const raw = (
      index as unknown as {
        search: (q: string) => Array<{
          id: string;
          type: SearchHitKind;
          title: string;
          subtitle: string;
          href: string;
          score: number;
          tags: string[];
        }>;
      }
    ).search(q);
    return raw.slice(0, 40).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      subtitle: r.subtitle,
      href: r.href,
      excerpt: "",
      score: r.score,
      tags: r.tags ?? [],
    }));
  }, [q, index]);

  const grouped = React.useMemo(() => {
    const g: Record<string, SearchHit[]> = {};
    results.forEach((h) => {
      g[h.type] ??= [];
      g[h.type].push(h);
    });
    return g;
  }, [results]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={
          ready ? "Search notes, specs, tasks, docs, standards, agents..." : "Indexing..."
        }
        value={q}
        onValueChange={setQ}
        autoFocus
      />
      <CommandList>
        <CommandEmpty>
          {q.trim() ? "Nothing matches." : "Type to search across the project."}
        </CommandEmpty>
        {Object.entries(grouped).map(([type, items]) => (
          <CommandGroup key={type} heading={type.toUpperCase()}>
            {items.map((h) => {
              const Icon = KIND_ICON[h.type as SearchHitKind];
              return (
                <CommandItem
                  key={`${type}_${h.id}`}
                  value={`${h.type} ${h.title} ${h.subtitle} ${h.tags.join(" ")}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(h.href);
                  }}
                >
                  <Icon className="text-muted-foreground h-3.5 w-3.5" />
                  <span className="truncate">{h.title}</span>
                  {h.subtitle && (
                    <span className="text-muted-foreground ml-auto text-[10px]">{h.subtitle}</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
