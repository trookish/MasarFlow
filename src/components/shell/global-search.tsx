"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/lib/stores/ui";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import {
  buildSearchItems,
  createSearchIndex,
  kindLabel,
  type SearchItem,
} from "@/lib/utils/search";

export function GlobalSearch() {
  const open = useUIStore((s) => s.searchOpen);
  const setOpen = useUIStore((s) => s.setSearchOpen);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      position="top"
      showClose={false}
      className="overflow-hidden p-0"
      ariaLabel="Global search"
    >
      {/* The Dialog unmounts children when closed, so SearchPanel always
          mounts fresh — query state resets on each open without an effect. */}
      <SearchPanel onClose={() => setOpen(false)} />
    </Dialog>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);

  useEffect(() => {
    let active = true;
    buildSearchItems(projectId ?? undefined).then((result) => {
      if (active) setItems(result);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  const fuse = useMemo(() => createSearchIndex(items), [items]);
  const results = useMemo(() => {
    if (!query.trim()) return items.slice(0, 12);
    return fuse
      .search(query)
      .slice(0, 30)
      .map((r) => r.item);
  }, [query, items, fuse]);

  function go(item: SearchItem) {
    onClose();
    router.push(item.href);
  }

  return (
    <Command shouldFilter={false} loop>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search notes, specs, tasks, standards, memories…"
        autoFocus
      />
      <CommandList>
        <CommandEmpty>
          {items.length === 0
            ? "Nothing to search yet — create a note or load demo data."
            : "No matches found."}
        </CommandEmpty>
        <CommandGroup heading={query.trim() ? "Results" : "Recent & all"}>
          {results.map((item) => (
            <CommandItem
              key={item.id}
              value={item.id}
              onSelect={() => go(item)}
            >
              <Badge variant="outline" className="shrink-0">
                {kindLabel(item.kind)}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{item.title}</div>
                {item.subtitle ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {item.subtitle}
                  </div>
                ) : null}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
