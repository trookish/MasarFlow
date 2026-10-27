"use client";

/**
 * Inbox (v0.3 P6 T2): notes captured without a folder. Each one is processed here: promote it to a
 * task (the note keeps a link), or mark it filed by moving it out of the inbox, or open it.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, CheckSquare, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { DAILY_TAG } from "@/lib/vault/daily";
import type { Note } from "@/lib/db/schema";
import { promoteNote } from "@/lib/domain/commands";
import { formatRelativeTime } from "@/lib/utils/relative-time";
import { Button } from "@/components/ui/button";
import { entityHref } from "@/lib/entities/registry";

const LIMIT = 8;

/** Unfiled notes that have not been promoted yet, newest first. */
export async function inboxNotes(projectId: string): Promise<Note[]> {
  const [notes, promoted] = await Promise.all([
    db.notes
      .where("projectId")
      .equals(projectId)
      .filter(
        (n) => !n.folderId && n.type === "note" && !n.tags.includes(DAILY_TAG),
      )
      .toArray(),
    db.links
      .where("projectId")
      .equals(projectId)
      .filter((l) => l.sourceType === "note" && l.label === "promoted")
      .toArray(),
  ]);
  const done = new Set(promoted.map((l) => l.sourceId));
  return notes
    .filter((n) => !done.has(n.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function TodayInbox({ projectId }: { projectId: string }) {
  const router = useRouter();
  const notes = useLiveQuery(() => inboxNotes(projectId), [projectId]) ?? [];

  return (
    <section
      aria-label="Inbox"
      data-testid="today-inbox"
      className="rounded-lg border border-border bg-card"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-medium">Inbox</h3>
        <p
          className="ml-auto text-xs text-muted-foreground"
          title="Notes saved without a folder that have not become a task yet."
        >
          {notes.length === 0 ? "Unfiled notes" : `${notes.length} unfiled`}
        </p>
      </header>
      {notes.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Inbox is empty. Notes saved without a folder land here until you
          process them.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {notes.slice(0, LIMIT).map((note) => (
            <li
              key={note.id}
              data-testid="today-inbox-item"
              className="flex items-center gap-2 px-3 py-2 text-xs"
            >
              <button
                type="button"
                onClick={() => router.push(entityHref({ kind: "note", id: note.id }))}
                className="min-w-0 flex-1 truncate text-left hover:underline"
                title="Open the note"
              >
                {note.title || "Untitled note"}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelativeTime(note.updatedAt)}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                title="Create a task from this note. The note stays and links to the task."
                onClick={() => void promoteNote(note.id, "task")}
              >
                <CheckSquare className="h-3 w-3" />
                Make task
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open note"
                onClick={() => router.push(entityHref({ kind: "note", id: note.id }))}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {notes.length > LIMIT && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          {notes.length - LIMIT} more in Capture, under Unfiled.
        </p>
      )}
    </section>
  );
}
