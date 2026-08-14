"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, PenTool } from "lucide-react";
import { notesRepo, foldersRepo, specsRepo } from "@/lib/db/repos";
import type { Note } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FolderTree, type FolderFilter } from "./folder-tree";
import { NoteList } from "./note-list";
import { NoteEditor } from "./note-editor";
import { ColumnResizer, useColumnWidth } from "./column-resizer";

export function NotesView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("note");

  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<FolderFilter>("all");
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [folderColWidth, setFolderColWidth] = useColumnWidth("folders", 208);
  const [notesColWidth, setNotesColWidth] = useColumnWidth("notes", 256);

  const notes = useLiveQuery(
    () => notesRepo.listByProject(projectId),
    [projectId],
  );
  const foldersRaw = useLiveQuery(
    () => foldersRepo.listByProject(projectId),
    [projectId],
  );
  const folders = useMemo(() => foldersRaw ?? [], [foldersRaw]);

  const allNotes = useMemo(() => notes ?? [], [notes]);
  const selectedNote = allNotes.find((n) => n.id === selectedId) ?? null;

  // A folder filter includes its nested subfolders: clicking a parent shows
  // everything below it, matching how the tree is rendered.
  const folderDescendants = useMemo(() => {
    const map = new Map<string, string[]>();
    const walk = (id: string, seen: Set<string>): string[] => {
      const cached = map.get(id);
      if (cached) return cached;
      const kids = folders.filter((f) => f.parentId === id && !seen.has(f.id));
      const next = new Set(seen);
      next.add(id);
      const res = [
        id,
        ...kids.flatMap((k) => walk(k.id, next)),
      ];
      map.set(id, res);
      return res;
    };
    folders.forEach((f) => walk(f.id, new Set()));
    return map;
  }, [folders]);

  const filtered = useMemo(() => {
    let list = allNotes;
    if (folder === "unfiled") list = list.filter((n) => !n.folderId);
    else if (folder !== "all") {
      const ids = folderDescendants.get(folder);
      list = list.filter((n) => n.folderId && ids?.includes(n.folderId));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.excerpt.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [allNotes, folder, query, folderDescendants]);

  // Clear a stale ?note= param (e.g. after switching projects) so the URL
  // never points at a note that doesn't exist here.
  useEffect(() => {
    if (!notes || !selectedId) return;
    if (!allNotes.some((n) => n.id === selectedId)) {
      router.replace("/brain", { scroll: false });
    }
  }, [notes, selectedId, allNotes, router]);

  function select(id: string | null) {
    router.replace(id ? `/brain?note=${id}` : "/brain", { scroll: false });
  }

  async function createNote() {
    if (!projectId) return;
    const folderId = folder !== "all" && folder !== "unfiled" ? folder : null;
    const note = await notesRepo.create({
      projectId,
      title: "Untitled note",
      folderId,
    });
    select(note.id);
  }

  async function deleteNote() {
    if (!selectedNote) return;
    await notesRepo.remove(selectedNote.id);
    select(null);
  }

  async function navigateToTitle(title: string) {
    if (!projectId) return;
    const note = await notesRepo.ensureByTitle(projectId, title);
    select(note.id);
  }

  async function createFolder(name: string) {
    if (!projectId) return;
    await foldersRepo.create({ projectId, name });
  }

  // Idea → Specification: spin a note up into an RFC linked back to the note.
  async function promoteToSpec(note: Note) {
    if (!projectId) return;
    const specs = await specsRepo.listByProject(projectId);
    const maxNum = specs.reduce((max, s) => {
      const m = /^RFC-(\d+)$/.exec(s.number);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const number = `RFC-${String(maxNum + 1).padStart(3, "0")}`;
    const spec = await specsRepo.create({
      projectId,
      number,
      title: note.title,
      purpose: note.excerpt,
      linkedNoteIds: [note.id],
    });
    router.push(`/specs?spec=${spec.id}`);
  }

  async function deleteFolder(id: string) {
    await foldersRepo.remove(id);
    if (folder === id) setFolder("all");
  }

  return (
    <div className="flex h-full">
      {/* Folders column */}
      <div
        className="flex shrink-0 flex-col border-r border-border"
        style={{ width: folderColWidth }}
      >
        <ScrollArea className="flex-1">
          <FolderTree
            folders={folders}
            notes={allNotes}
            selected={folder}
            onSelect={setFolder}
            onCreateFolder={createFolder}
            onDeleteFolder={(id) => {
              const f = folders.find((x) => x.id === id);
              setFolderToDelete({ id, name: f?.name ?? "folder" });
            }}
          />
        </ScrollArea>
      </div>
      <ColumnResizer
        onDelta={(dx) =>
          setFolderColWidth((w) => Math.min(420, Math.max(160, w + dx)))
        }
      />

      {/* Notes column */}
      <div
        className="flex shrink-0 flex-col border-r border-border"
        style={{ width: notesColWidth }}
      >
        <div className="flex items-center gap-2 border-b border-border p-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            size="icon-sm"
            aria-label="New note"
            onClick={createNote}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <NoteList
            notes={filtered}
            selectedId={selectedId}
            onSelect={select}
            emptyLabel={
              query.trim()
                ? "No notes match your search."
                : folder !== "all"
                  ? "No notes in this folder."
                  : "No notes here yet."
            }
          />
        </ScrollArea>
      </div>
      <ColumnResizer
        onDelta={(dx) =>
          setNotesColWidth((w) => Math.min(560, Math.max(200, w + dx)))
        }
      />

      {/* Editor / empty */}
      <div className="min-w-0 flex-1">
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            projectId={projectId!}
            allNotes={allNotes}
            onNavigateToTitle={navigateToTitle}
            onDelete={() => setConfirmDeleteNote(true)}
            onPromote={() => promoteToSpec(selectedNote)}
          />
        ) : (
          <EmptyState
            icon={PenTool}
            title="No note selected"
            description="Pick a note from the list, or create a new one to start capturing ideas. Link notes with [[wikilinks]]."
            className="h-full"
            action={
              <Button onClick={createNote} disabled={!projectId}>
                <Plus className="h-4 w-4" />
                New note
              </Button>
            }
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteNote}
        onOpenChange={setConfirmDeleteNote}
        title="Delete note?"
        description={
          selectedNote
            ? `"${selectedNote.title || "Untitled note"}" will be removed along with its links and backlinks.`
            : undefined
        }
        onConfirm={() => void deleteNote()}
      />

      <ConfirmDialog
        open={folderToDelete !== null}
        onOpenChange={(v) => !v && setFolderToDelete(null)}
        title="Delete folder?"
        description={
          folderToDelete
            ? `"${folderToDelete.name}" will be removed. Notes inside it move to the project root.`
            : undefined
        }
        onConfirm={() => {
          if (folderToDelete) void deleteFolder(folderToDelete.id);
          setFolderToDelete(null);
        }}
      />
    </div>
  );
}
