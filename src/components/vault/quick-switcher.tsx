"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog } from "@/components/ui/dialog";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { useUIStore } from "@/lib/stores/ui";
import { loadQuickItems, rankQuickItems, KIND_LABEL } from "@/lib/vault/quick-switch";

/** Ctrl/Cmd+O quick switcher (P7.T14). The dialog only mounts while open, so
 * the query resets by unmounting — no setState-in-effect. */
export function QuickSwitcher() {
  const open = useUIStore((s) => s.quickSwitchOpen);
  if (!open) return null;
  return <QuickSwitcherDialog />;
}

function QuickSwitcherDialog() {
  const setOpen = useUIStore((s) => s.setQuickSwitchOpen);
  const projectId = useActiveProjectId();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const items = useLiveQuery(async () => (projectId ? loadQuickItems(projectId) : []), [projectId]);
  const results = useMemo(() => rankQuickItems(items ?? [], query), [items, query]);

  const go = (href: string): void => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Dialog
      open
      onOpenChange={setOpen}
      position="top"
      showClose={false}
      className="overflow-hidden p-0"
      ariaLabel="Quick switcher"
    >
      {/* Ranking happens in rankQuickItems (Fuse) — cmdk must not filter twice. */}
      <Command shouldFilter={false} loop>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Jump to a note, doc, spec or task…"
        />
        <CommandList className="max-h-80">
          <CommandEmpty>Nothing matches.</CommandEmpty>
          {results.map((item) => (
            <CommandItem
              key={`${item.kind}:${item.id}`}
              value={`${item.kind}:${item.id}`}
              onSelect={() => go(item.href)}
              className="justify-between"
            >
              <span className="truncate">{item.title}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {KIND_LABEL[item.kind]}
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </Dialog>
  );
}
