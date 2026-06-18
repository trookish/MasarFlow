"use client";

import type { Note } from "@/lib/db/schema";
import { NOTE_TYPE_DOT } from "@/lib/colors";
import { cn } from "@/lib/utils/cn";

interface NoteListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatWhen(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function NoteList({ notes, selectedId, onSelect }: NoteListProps) {
  if (notes.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-muted-foreground">
        No notes here yet.
      </div>
    );
  }

  return (
    <ul className="p-2">
      {notes.map((note) => {
        const active = note.id === selectedId;
        return (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => onSelect(note.id)}
              className={cn(
                "mb-1 w-full rounded-md border px-3 py-2 text-left transition-colors",
                active
                  ? "border-border bg-accent"
                  : "border-transparent hover:bg-accent/50",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    NOTE_TYPE_DOT[note.type],
                  )}
                />
                <span className="flex-1 truncate text-sm font-medium">
                  {note.title || "Untitled note"}
                </span>
              </div>
              {note.excerpt ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {note.excerpt}
                </p>
              ) : null}
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="capitalize">{note.type}</span>
                <span>·</span>
                <span>{formatWhen(note.updatedAt)}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
