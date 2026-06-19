"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Trash2, FileUp } from "lucide-react";
import { notesRepo } from "@/lib/db/repos";
import { NOTE_TYPES, type Note, type NoteType } from "@/lib/db/schema";
import { NOTE_TYPE_DOT } from "@/lib/colors";
import { cn } from "@/lib/utils/cn";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "./markdown-preview";
import { TagInput } from "./tag-input";
import { TemplatePicker } from "./template-picker";
import { RichMarkdownEditor } from "./rich-markdown-editor";

interface NoteEditorProps {
  note: Note;
  projectId: string;
  allNotes: Note[];
  onNavigateToTitle: (title: string) => void;
  onDelete: () => void;
  onPromote: () => void;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function NoteEditor({
  note,
  projectId,
  allNotes,
  onNavigateToTitle,
  onDelete,
  onPromote,
}: NoteEditorProps) {
  const noteId = note.id;
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [type, setType] = useState<NoteType>(note.type);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [mode, setMode] = useState<"write" | "read">("write");

  const loaded = useRef(note);
  const latest = useRef({ title: note.title, body: note.body, type: note.type, tags: note.tags });

  // Debounced autosave.
  useEffect(() => {
    latest.current = { title, body, type, tags };
    const l = loaded.current;
    if (l.id !== noteId) return;
    if (title === l.title && body === l.body && type === l.type && arraysEqual(tags, l.tags)) return;
    const handle = setTimeout(async () => {
      await notesRepo.update(noteId, { title, body, type, tags });
      loaded.current = { ...loaded.current, title, body, type, tags };
    }, 450);
    return () => clearTimeout(handle);
  }, [title, body, type, tags, noteId]);

  // Flush on unmount (switching notes faster than debounce).
  useEffect(() => {
    return () => {
      const l = loaded.current;
      const cur = latest.current;
      if (cur.title !== l.title || cur.body !== l.body || cur.type !== l.type || !arraysEqual(cur.tags, l.tags)) {
        void notesRepo.update(noteId, cur);
      }
    };
  }, [noteId]);

  const noteSuggestions = useMemo(
    () => allNotes.filter((n) => n.id !== noteId).map((n) => ({ id: n.id, title: n.title })),
    [allNotes, noteId],
  );

  function applyTemplate(templateBody: string, templateType: NoteType) {
    if (!body.trim()) {
      setBody(templateBody);
      setType(templateType);
    } else {
      setBody((b) => b + templateBody);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled note"
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete note"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm">
                <span className={cn("h-2.5 w-2.5 rounded-full", NOTE_TYPE_DOT[type])} />
                <span className="capitalize">{type}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {NOTE_TYPES.map((t) => (
                <DropdownMenuItem key={t} onSelect={() => setType(t)} active={t === type}>
                  <span className={cn("h-2.5 w-2.5 rounded-full", NOTE_TYPE_DOT[t])} />
                  <span className="capitalize">{t}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <TemplatePicker
            projectId={projectId}
            onPick={(tpl) => applyTemplate(tpl.body, tpl.type)}
          />

          <Button variant="outline" size="sm" onClick={onPromote}>
            <FileUp className="h-3.5 w-3.5" />
            Promote to spec
          </Button>

          <div className="ml-auto">
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="read">Read</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <TagInput value={tags} onChange={setTags} />
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {mode === "write" ? (
          <RichMarkdownEditor
            key={noteId}
            value={body}
            onChange={setBody}
            suggestions={noteSuggestions}
            className="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
          />
        ) : (
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <MarkdownPreview content={body} onWikilink={onNavigateToTitle} />
          </div>
        )}
      </div>
    </div>
  );
}
