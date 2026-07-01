"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, ChevronRight, Link2, Unlink, ArrowUpRight } from "lucide-react";
import { linksRepo, notesRepo } from "@/lib/db/repos";
import type { Note } from "@/lib/db/schema";
import { extractWikilinkTargets } from "@/lib/utils/markdown";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

/**
 * Obsidian-style backlinks pane: linked mentions (real wikilink edges from the
 * links table), unlinked mentions (notes whose text contains this note's
 * title without linking it — with one-click "Link"), and outgoing links.
 */
export function BacklinksPanel({
  note,
  allNotes,
  onNavigate,
}: {
  note: Note;
  allNotes: Note[];
  onNavigate: (title: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const incoming = useLiveQuery(
    () => linksRepo.listByTarget("note", note.id),
    [note.id, note.updatedAt],
  );
  const outgoing = useLiveQuery(
    () => linksRepo.listBySource("note", note.id),
    [note.id, note.updatedAt],
  );

  const byId = useMemo(
    () => new Map(allNotes.map((n) => [n.id, n])),
    [allNotes],
  );

  const linkedMentions = useMemo(
    () =>
      (incoming ?? [])
        .filter((l) => l.sourceType === "note")
        .map((l) => byId.get(l.sourceId))
        .filter((n): n is Note => Boolean(n)),
    [incoming, byId],
  );

  const outgoingNotes = useMemo(
    () =>
      (outgoing ?? [])
        .filter((l) => l.targetType === "note")
        .map((l) => byId.get(l.targetId))
        .filter((n): n is Note => Boolean(n)),
    [outgoing, byId],
  );

  // Unlinked mentions: the title appears in another note's body but there is
  // no wikilink to this note from it.
  const unlinkedMentions = useMemo(() => {
    const title = note.title.trim();
    if (title.length < 3 || title.toLowerCase() === "untitled note") return [];
    const linkedFrom = new Set(linkedMentions.map((n) => n.id));
    const needle = title.toLowerCase();
    return allNotes.filter((n) => {
      if (n.id === note.id || linkedFrom.has(n.id)) return false;
      if (!n.body.toLowerCase().includes(needle)) return false;
      // Skip when the only occurrences are already wikilinks.
      const targets = extractWikilinkTargets(n.body).map((t) => t.toLowerCase());
      if (targets.includes(needle)) return false;
      return true;
    });
  }, [allNotes, note.id, note.title, linkedMentions]);

  async function linkMention(source: Note) {
    // Wrap the first plain occurrence of the title in [[ ]].
    const title = note.title.trim();
    const re = new RegExp(
      `(?<!\\[\\[)(${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?!\\]\\])`,
      "i",
    );
    if (!re.test(source.body)) return;
    await notesRepo.update(source.id, {
      body: source.body.replace(re, `[[${title}]]`),
    });
  }

  const total =
    linkedMentions.length + unlinkedMentions.length + outgoingNotes.length;

  return (
    <div className="shrink-0 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-5 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Link2 className="h-3.5 w-3.5" />
        Connections
        <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
          {total}
        </span>
      </button>

      {open && (
        <div className="scrollbar-thin max-h-56 space-y-4 overflow-y-auto px-5 pt-1 pb-4">
          <MentionGroup
            label="Linked mentions"
            emptyLabel="No notes link here yet."
            notes={linkedMentions}
            onNavigate={onNavigate}
          />
          {unlinkedMentions.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Unlinked mentions
              </h4>
              <ul className="space-y-1">
                {unlinkedMentions.map((n) => (
                  <li key={n.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(n.title)}
                      className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:text-primary hover:underline"
                    >
                      {n.title}
                      {n.excerpt && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {n.excerpt.slice(0, 80)}
                        </span>
                      )}
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => void linkMention(n)}
                    >
                      <Unlink className="h-3 w-3" /> Link
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <MentionGroup
            label="Outgoing links"
            emptyLabel="This note doesn't link anywhere yet — type [[ to link."
            notes={outgoingNotes}
            onNavigate={onNavigate}
            icon={<ArrowUpRight className="h-3 w-3" />}
          />
        </div>
      )}
    </div>
  );
}

function MentionGroup({
  label,
  emptyLabel,
  notes,
  onNavigate,
  icon,
}: {
  label: string;
  emptyLabel: string;
  notes: Note[];
  onNavigate: (title: string) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h4>
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {notes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onNavigate(n.title)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-1.5 truncate text-left text-sm",
                  "text-foreground hover:text-primary hover:underline",
                )}
              >
                {icon}
                <span className="truncate">{n.title}</span>
                {n.excerpt && (
                  <span className="truncate text-xs text-muted-foreground">
                    {n.excerpt.slice(0, 80)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
