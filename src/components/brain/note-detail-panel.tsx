"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpRight, X, Link2, CornerUpLeft } from "lucide-react";
import { db } from "@/lib/db";
import { linksRepo, notesRepo } from "@/lib/db/repos";
import { GRAPH_KIND_LABEL, type GraphKind } from "@/lib/colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type EntityCategory = "note" | "spec" | "task" | "system" | "commit";

export interface SelectedGraphNode {
  key: string;
  category: EntityCategory;
  refId: string;
  label: string;
  kind: GraphKind;
}

interface NoteDetailPanelProps {
  node: SelectedGraphNode;
  onClose: () => void;
  onSelectNote: (noteId: string) => void;
  onOpen: (category: EntityCategory, refId: string) => void;
}

export function NoteDetailPanel({
  node,
  onClose,
  onSelectNote,
  onOpen,
}: NoteDetailPanelProps) {
  const isNote = node.category === "note";

  const note = useLiveQuery(
    async () => (isNote ? db.notes.get(node.refId) : undefined),
    [node.refId, isNote],
  );
  const siblingNotes =
    useLiveQuery(
      () => notesRepo.listByProject(note?.projectId),
      [note?.projectId],
    ) ?? [];
  const outgoing = useLiveQuery(
    () => linksRepo.listBySource("note", node.refId),
    [node.refId],
  );
  const incoming = useLiveQuery(
    () => linksRepo.listByTarget("note", node.refId),
    [node.refId],
  );

  const titleOf = (id: string) =>
    (siblingNotes ?? []).find((n) => n.id === id)?.title ?? "Untitled";

  const outIds = (outgoing ?? [])
    .filter((l) => l.linkType === "wikilink")
    .map((l) => l.targetId);
  const inIds = (incoming ?? [])
    .filter((l) => l.linkType === "wikilink")
    .map((l) => l.sourceId);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0 space-y-1.5">
          <Badge variant="outline">{GRAPH_KIND_LABEL[node.kind]}</Badge>
          <h3 className="text-sm font-semibold break-words">
            {note?.title ?? node.label}
          </h3>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {isNote && note ? (
          <>
            {note.excerpt ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {note.excerpt}
              </p>
            ) : null}
            {note.tags.length ? (
              <div className="flex flex-wrap gap-1">
                {note.tags.map((t) => (
                  <Badge key={t} variant="primary">
                    #{t}
                  </Badge>
                ))}
              </div>
            ) : null}

            <LinkSection
              icon={<Link2 className="h-3.5 w-3.5" />}
              title={`Links (${outIds.length})`}
              ids={outIds}
              labelOf={titleOf}
              onSelect={onSelectNote}
            />
            <LinkSection
              icon={<CornerUpLeft className="h-3.5 w-3.5" />}
              title={`Backlinks (${inIds.length})`}
              ids={inIds}
              labelOf={titleOf}
              onSelect={onSelectNote}
            />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {GRAPH_KIND_LABEL[node.kind]} node.
          </p>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onOpen(node.category, node.refId)}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Open {isNote ? "in editor" : GRAPH_KIND_LABEL[node.kind]}
        </Button>
      </div>
    </aside>
  );
}

function LinkSection({
  icon,
  title,
  ids,
  labelOf,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  ids: string[];
  labelOf: (id: string) => string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {icon}
        {title}
      </div>
      {ids.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">None</p>
      ) : (
        <ul className="space-y-0.5">
          {ids.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                className="w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
              >
                {labelOf(id)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
