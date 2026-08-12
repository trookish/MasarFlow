"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

interface CategoryPickerProps {
  /** Category names this project already has (shown as options). */
  options: string[];
  /** Currently selected category ("" = none). */
  value: string;
  onChange: (value: string) => void;
  /** Persist a brand-new category; receives the name to store. */
  onCreate: (name: string) => void | Promise<void>;
}

/**
 * Category select with an inline "Add category +" row — new projects start
 * with no categories, so the plus is how the first one comes into existence.
 */
export function CategoryPicker({
  options,
  value,
  onChange,
  onCreate,
}: CategoryPickerProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function commit() {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onCreate(name);
      setDraft("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between"
          aria-label="Category"
        >
          <span className="truncate">{value || "No category"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Categories</DropdownMenuLabel>
        <DropdownMenuItem active={!value} onSelect={() => onChange("")}>
          <Check
            className={cn("h-3.5 w-3.5", !value ? "opacity-100" : "opacity-0")}
          />
          No category
        </DropdownMenuItem>
        {options.map((c) => (
          <DropdownMenuItem
            key={c}
            active={c === value}
            onSelect={() => onChange(c)}
          >
            <Check
              className={cn(
                "h-3.5 w-3.5",
                c === value ? "opacity-100" : "opacity-0",
              )}
            />
            <span className="truncate">{c}</span>
          </DropdownMenuItem>
        ))}
        {options.length > 0 ? <DropdownMenuSeparator /> : null}
        {adding ? (
          <div className="p-1">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commit();
              }}
              placeholder="Category name…"
              className="h-8 text-sm"
            />
            <p className="mt-1 px-1 text-[11px] text-muted-foreground">
              Press Enter to add and select.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
              busy && "pointer-events-none opacity-50",
            )}
          >
            <Plus className="h-3.5 w-3.5" /> Add category
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
