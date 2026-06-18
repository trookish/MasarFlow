"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
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
import {
  WikilinkAutocomplete,
  type WikilinkSuggestion,
} from "./wikilink-autocomplete";

interface NoteEditorProps {
  note: Note;
  projectId: string;
  allNotes: Note[];
  onNavigateToTitle: (title: string) => void;
  onDelete: () => void;
}

interface AutocompleteState {
  open: boolean;
  start: number;
  query: string;
  activeIndex: number;
}

const CLOSED: AutocompleteState = {
  open: false,
  start: 0,
  query: "",
  activeIndex: 0,
};

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function detectWikilink(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;
  const between = before.slice(open + 2);
  if (
    between.includes("]]") ||
    between.includes("\n") ||
    between.includes("[[")
  ) {
    return null;
  }
  return { start: open, query: between };
}

export function NoteEditor({
  note,
  projectId,
  allNotes,
  onNavigateToTitle,
  onDelete,
}: NoteEditorProps) {
  const noteId = note.id;
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [type, setType] = useState<NoteType>(note.type);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [view, setView] = useState<"edit" | "split" | "preview">("split");
  const [ac, setAc] = useState<AutocompleteState>(CLOSED);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The parent remounts this component per note (key={note.id}), so the
  // useState initializers above already give fresh state; `loaded` captures the
  // last-persisted snapshot and `latest` the most recent edits.
  const loaded = useRef(note);
  const latest = useRef({
    title: note.title,
    body: note.body,
    type: note.type,
    tags: note.tags,
  });

  // Debounced autosave — only when content actually changed.
  useEffect(() => {
    latest.current = { title, body, type, tags };
    const l = loaded.current;
    if (l.id !== noteId) return;
    if (
      title === l.title &&
      body === l.body &&
      type === l.type &&
      arraysEqual(tags, l.tags)
    ) {
      return;
    }
    const handle = setTimeout(async () => {
      await notesRepo.update(noteId, { title, body, type, tags });
      loaded.current = { ...loaded.current, title, body, type, tags };
    }, 450);
    return () => clearTimeout(handle);
  }, [title, body, type, tags, noteId]);

  // Flush a still-pending edit on unmount (e.g. switching notes faster than the
  // debounce) so the last keystrokes are never lost.
  useEffect(() => {
    return () => {
      const l = loaded.current;
      const cur = latest.current;
      if (
        cur.title !== l.title ||
        cur.body !== l.body ||
        cur.type !== l.type ||
        !arraysEqual(cur.tags, l.tags)
      ) {
        void notesRepo.update(noteId, cur);
      }
    };
  }, [noteId]);

  const suggestions: WikilinkSuggestion[] = useMemo(() => {
    if (!ac.open) return [];
    const q = ac.query.trim().toLowerCase();
    return allNotes
      .filter((n) => n.id !== noteId)
      .filter((n) => !q || n.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((n) => ({ id: n.id, title: n.title }));
  }, [ac.open, ac.query, allNotes, noteId]);

  const allowCreate = useMemo(() => {
    const q = ac.query.trim().toLowerCase();
    return Boolean(q) && !allNotes.some((n) => n.title.toLowerCase() === q);
  }, [ac.query, allNotes]);

  const optionCount =
    suggestions.length + (allowCreate && ac.query.trim() ? 1 : 0);

  function refreshAutocomplete(el: HTMLTextAreaElement) {
    const hit = detectWikilink(el.value, el.selectionStart);
    if (hit) {
      setAc((prev) => ({
        open: true,
        start: hit.start,
        query: hit.query,
        activeIndex: prev.open ? prev.activeIndex : 0,
      }));
    } else {
      setAc(CLOSED);
    }
  }

  function insertWikilink(linkTitle: string) {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = body.slice(0, ac.start);
    const after = body.slice(caret);
    const insert = `[[${linkTitle}]]`;
    const next = before + insert + after;
    setBody(next);
    setAc(CLOSED);
    const newCaret = (before + insert).length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
    });
  }

  function chooseActive() {
    if (ac.activeIndex < suggestions.length) {
      insertWikilink(suggestions[ac.activeIndex].title);
    } else if (allowCreate) {
      insertWikilink(ac.query.trim());
    }
  }

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!ac.open || optionCount === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAc((p) => ({ ...p, activeIndex: (p.activeIndex + 1) % optionCount }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAc((p) => ({
        ...p,
        activeIndex: (p.activeIndex - 1 + optionCount) % optionCount,
      }));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      chooseActive();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAc(CLOSED);
    }
  }

  function applyTemplate(templateBody: string, templateType: NoteType) {
    const el = textareaRef.current;
    if (!body.trim()) {
      setBody(templateBody);
      setType(templateType);
      return;
    }
    const caret = el?.selectionStart ?? body.length;
    setBody(body.slice(0, caret) + templateBody + body.slice(caret));
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
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    NOTE_TYPE_DOT[type],
                  )}
                />
                <span className="capitalize">{type}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {NOTE_TYPES.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={() => setType(t)}
                  active={t === type}
                >
                  <span
                    className={cn("h-2.5 w-2.5 rounded-full", NOTE_TYPE_DOT[t])}
                  />
                  <span className="capitalize">{t}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <TemplatePicker
            projectId={projectId}
            onPick={(tpl) => applyTemplate(tpl.body, tpl.type)}
          />

          <div className="ml-auto">
            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
              <TabsList>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="split">Split</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <TagInput value={tags} onChange={setTags} />
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {view !== "preview" ? (
          <div
            className={cn(
              "relative min-h-0",
              view === "split" ? "w-1/2 border-r border-border" : "flex-1",
            )}
          >
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                refreshAutocomplete(e.target);
              }}
              onKeyDown={onEditorKeyDown}
              onClick={(e) => refreshAutocomplete(e.currentTarget)}
              onKeyUp={(e) => {
                if (
                  e.key.startsWith("Arrow") ||
                  e.key === "Home" ||
                  e.key === "End"
                ) {
                  refreshAutocomplete(e.currentTarget);
                }
              }}
              onBlur={() => setAc(CLOSED)}
              placeholder="Write in Markdown. Use [[ to link notes…"
              spellCheck={false}
              className="scrollbar-thin h-full w-full resize-none bg-transparent px-5 py-4 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            <WikilinkAutocomplete
              suggestions={suggestions}
              query={ac.query}
              activeIndex={ac.activeIndex}
              allowCreate={allowCreate}
              onSelect={insertWikilink}
            />
          </div>
        ) : null}

        {view !== "edit" ? (
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <MarkdownPreview content={body} onWikilink={onNavigateToTitle} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
