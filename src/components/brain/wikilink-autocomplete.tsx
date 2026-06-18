"use client";

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface WikilinkSuggestion {
  id: string;
  title: string;
}

interface WikilinkAutocompleteProps {
  suggestions: WikilinkSuggestion[];
  query: string;
  activeIndex: number;
  onSelect: (title: string) => void;
  /** Whether the typed query matches no existing note (offers to create). */
  allowCreate: boolean;
}

export function WikilinkAutocomplete({
  suggestions,
  query,
  activeIndex,
  onSelect,
  allowCreate,
}: WikilinkAutocompleteProps) {
  if (suggestions.length === 0 && !(allowCreate && query.trim())) return null;

  return (
    <div className="absolute bottom-3 left-3 z-20 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-xl">
      <div className="border-b border-border px-3 py-1.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        Link to note
      </div>
      <ul className="scrollbar-thin max-h-56 overflow-y-auto p-1">
        {suggestions.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(s.title);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{s.title}</span>
            </button>
          </li>
        ))}
        {allowCreate && query.trim() ? (
          <li>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(query.trim());
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                activeIndex === suggestions.length
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">Create “{query.trim()}”</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
