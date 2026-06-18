"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, PenTool } from "lucide-react";
import { notesRepo, foldersRepo } from "@/lib/db/repos";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderTree, type FolderFilter } from "./folder-tree";
import { NoteList } from "./note-list";
import { NoteEditor } from "./note-editor";

export function NotesView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("note");

  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<FolderFilter>("all");

  const notes = useLiveQuery(
    () => notesRepo.listByProject(projectId),
    [projectId],
  );
  const folders =
    useLiveQuery(() => foldersRepo.listByProject(projectId), [projectId]) ?? [];

  const allNotes = useMemo(() => notes ?? [], [notes]);
  const selectedNote = allNotes.find((n) => n.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    let list = allNotes;
    if (folder === "unfiled") list = list.filter((n) => !n.folderId);
    else if (folder !== "all") list = list.filter((n) => n.folderId === folder);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.excerpt.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [allNotes, folder, query]);

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

  async function deleteFolder(id: string) {
    await foldersRepo.remove(id);
    if (folder === id) setFolder("all");
  }

  return (
    <div className="flex h-full">
      {/* Left pane */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
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
          <FolderTree
            folders={folders}
            notes={allNotes}
            selected={folder}
            onSelect={setFolder}
            onCreateFolder={createFolder}
            onDeleteFolder={deleteFolder}
          />
          <NoteList
            notes={filtered}
            selectedId={selectedId}
            onSelect={select}
          />
        </ScrollArea>
      </div>

      {/* Editor / empty */}
      <div className="min-w-0 flex-1">
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            projectId={projectId!}
            allNotes={allNotes}
            onNavigateToTitle={navigateToTitle}
            onDelete={deleteNote}
          />
        ) : (
          <EmptyState
            icon={PenTool}
            title="No note selected"
            description="Pick a note from the list, or create a new one to start capturing ideas. Link notes with [[wikilinks]]."
            action={
              <Button onClick={createNote} disabled={!projectId}>
                <Plus className="h-4 w-4" />
                New note
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
