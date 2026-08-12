"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils/cn";

/** How many icons render before "Show more" kicks in (progressive load). */
const BATCH = 240;

interface IconPickerProps {
  /** Currently selected lucide icon name (kebab-case). */
  value: string;
  onSelect: (name: string) => void;
}

/**
 * Searchable picker over the full Lucide icon set (~2,000 icons). Icons load
 * lazily per-name via lucide's DynamicIcon, so the bundle stays small; the
 * grid grows in batches to avoid a chunk-request flood.
 */
export function IconPicker({ value, onSelect }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(BATCH);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return iconNames;
    return iconNames.filter((n) => n.includes(q));
  }, [query]);

  function openPicker() {
    setQuery("");
    setCount(BATCH);
    setOpen(true);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={openPicker}
        className="justify-start gap-2"
        aria-label="Pick an icon"
      >
        <DynamicIcon name={value as IconName} className="h-4 w-4 shrink-0" />
        <span className="max-w-28 truncate font-mono text-xs">{value}</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        className="max-w-2xl"
        position="top"
        ariaLabel="Pick an icon"
      >
        <DialogHeader>
          <DialogTitle>Pick an icon</DialogTitle>
        </DialogHeader>
        <DialogBody className="px-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons — e.g. rocket, folder, brain…"
              className="h-9 pl-8"
            />
          </div>
        </DialogBody>
        <div className="px-4 pb-4">
          <ScrollArea className="h-64 rounded-md border border-border p-2">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1">
              {filtered.slice(0, count).map((name) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={`${name} icon`}
                  onClick={() => {
                    onSelect(name);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    name === value &&
                      "border-primary bg-primary/15 text-primary",
                  )}
                >
                  <DynamicIcon name={name} className="h-4 w-4" />
                </button>
              ))}
            </div>
            {count < filtered.length ? (
              <button
                type="button"
                onClick={() => setCount((c) => c + BATCH)}
                className="mt-1 w-full rounded py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Show more ({filtered.length - count} remaining)
              </button>
            ) : null}
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No icons match “{query.trim()}”.
              </p>
            ) : null}
          </ScrollArea>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {iconNames.length} icons from Lucide — type to search the full
            library, or upload a custom image below.
          </p>
        </div>
      </Dialog>
    </>
  );
}
