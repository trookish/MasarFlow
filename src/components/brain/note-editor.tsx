"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Save,
  Trash2,
  Hash,
  Folder,
  Sparkles,
  Link2,
  Clock,
  Tag as TagIcon,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useNote } from "@/lib/db/repos/notes";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useFolders, useTags } from "@/lib/db/repos/misc";
import { getDb, NOTE_TYPES, type Note, type NoteType } from "@/lib/db/schema";
import { findBacklinks, slugify, extractTagsFromText } from "@/lib/markdown/links";
import { markdownToHtml } from "@/lib/markdown/render";
import { formatRelativeTime } from "@/lib/utils";
import { Brain } from "lucide-react";
import { useNotes } from "@/lib/db/repos/notes";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

const RichEditor = dynamic(
  () => import("@/components/editor/rich-editor").then((m) => m.RichEditor),
  { ssr: false, loading: () => <Skeleton className="h-[480px] w-full rounded-lg" /> },
);

type SaveState = "idle" | "dirty" | "saving" | "saved";

export function NoteEditor({ noteId }: { noteId: string }) {
  const router = useRouter();
  const note = useNote(noteId);
  const project = useActiveProject();
  const allNotes = useNotes(project?.id);
  const folders = useFolders(note?.projectId);
  const existingTags = useTags();
  const [draft, setDraft] = React.useState<Note | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [view, setView] = React.useState<"edit" | "preview">("edit");
  const [tagInput, setTagInput] = React.useState("");

  React.useEffect(() => {
    if (note && !draft) setDraft(note);
  }, [note, draft]);

  React.useEffect(() => {
    if (!draft) return;
    const t = setTimeout(async () => {
      if (saveState !== "dirty") return;
      setSaveState("saving");
      try {
        await getDb().notes.put({
          ...draft,
          updatedAt: Date.now(),
          excerpt: deriveExcerpt(draft.body),
        });
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 900);
      } catch (e) {
        toast.error("Failed to save", { description: (e as Error).message });
        setSaveState("idle");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [draft, saveState]);

  React.useEffect(() => {
    const h = () => { if (draft) update(draft); };
    window.addEventListener("masarflow:request-save", h);
    return () => window.removeEventListener("masarflow:request-save", h);
  }, [draft]);

  const update = (patch: Partial<Note>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setSaveState("dirty");
  };

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/^#/, "");
    if (!t) return;
    if (!draft) return;
    if (draft.tags.includes(t)) return;
    update({ tags: [...draft.tags, t] });
  };

  const removeTag = (t: string) => {
    if (!draft) return;
    update({ tags: draft.tags.filter((x) => x !== t) });
  };

  const onBodyChange = (body: string) => {
    if (!draft) return;
    const merged = Array.from(new Set([...draft.tags, ...extractTagsFromText(body)]));
    update({ body, tags: merged });
  };

  const backlinks = React.useMemo(() => {
    if (!draft || !allNotes) return [];
    return findBacklinks(draft.title, allNotes);
  }, [draft?.title, draft, allNotes]);

  const onDelete = async () => {
    if (!draft) return;
    if (!window.confirm(`Delete "${draft.title}"? This cannot be undone.`)) return;
    await getDb().notes.delete(draft.id);
    toast.success("Note deleted");
    router.push("/brain");
  };

  if (note === undefined || !draft) {
    return (
      <div className="p-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-4 h-96 w-full" />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Brain}
          title="Note not found"
          description="The note you're looking for doesn't exist or has been deleted."
          actionLabel="Back to Brain"
        />
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-background/85 px-6 py-2.5 backdrop-blur">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/brain" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Brain
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <SaveIndicator state={saveState} />
          <div className="flex items-center rounded-md border border-border bg-surface-2 p-0.5 text-xs">
            <button
              onClick={() => setView("edit")}
              className={cn(
                "rounded-sm px-2.5 py-1 transition-colors",
                view === "edit" ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <Pencil className="mr-1 inline-block h-3 w-3" /> Edit
            </button>
            <button
              onClick={() => setView("preview")}
              className={cn(
                "rounded-sm px-2.5 py-1 transition-colors",
                view === "preview" ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <Sparkles className="mr-1 inline-block h-3 w-3" /> Preview
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={onDelete} className="gap-1.5 text-[color:var(--danger)]">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="space-y-2">
            <input
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Untitled note"
              className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <TypeSelector value={draft.type} onChange={(t) => update({ type: t })} />
              <FolderSelector
                folders={folders ?? []}
                value={draft.folderId}
                onChange={(id) => update({ folderId: id })}
              />
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" /> {formatRelativeTime(draft.updatedAt)}
              </span>
            </div>
          </div>

          {view === "edit" ? (
            <RichEditor value={draft.body} onChange={onBodyChange} placeholder="Start writing…" />
          ) : (
            <Card>
              <CardContent className="p-6">
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(draft.body) }}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardDescription>Tags</CardDescription>
              <CardTitle className="mt-1 text-sm">Organize</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {draft.tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => removeTag(t)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] hover:border-[color:var(--danger)] hover:text-[color:var(--danger)]"
                    title="Remove tag"
                  >
                    <Hash className="h-2.5 w-2.5" /> {t}
                  </button>
                ))}
                {draft.tags.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">No tags. Type # in the body or add below.</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      addTag(tagInput);
                      setTagInput("");
                    }
                  }}
                  placeholder="add-tag"
                  className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    addTag(tagInput);
                    setTagInput("");
                  }}
                >
                  Add
                </Button>
              </div>
              {existingTags && existingTags.length > 0 && (
                <div className="border-t border-border pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Suggestions</div>
                  <div className="flex flex-wrap gap-1">
                    {existingTags
                      .filter((t) => !draft.tags.includes(t.name))
                      .slice(0, 8)
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => addTag(t.name)}
                          className="inline-flex items-center gap-0.5 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-foreground/30"
                        >
                          + {t.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> Backlinks
              </CardDescription>
              <CardTitle className="mt-1 text-sm">{backlinks.length} incoming</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {backlinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No other notes link here yet. Reference this note with{" "}
                  <code className="rounded bg-muted px-1">[[{draft.title}]]</code>.
                </p>
              ) : (
                backlinks.map((b) => (
                  <Link
                    key={b.sourceNote.id}
                    href={`/brain/${b.sourceNote.id}`}
                    className="block rounded-md border border-border p-2 transition-colors hover:border-border/80 hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {b.sourceNote.type}
                      </Badge>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {formatRelativeTime(b.sourceNote.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-medium">{b.sourceNote.title}</div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground text-pretty">
                      {b.snippet}
                    </p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Outgoing</CardDescription>
              <CardTitle className="mt-1 text-sm">Wiki links in this note</CardTitle>
            </CardHeader>
            <CardContent>
              <OutgoingLinks body={draft.body} selfId={draft.id} selfTitle={draft.title} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { icon: React.ReactNode; label: string; color: string }> = {
    idle: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Saved", color: "text-muted-foreground" },
    dirty: { icon: <Pencil className="h-3.5 w-3.5" />, label: "Unsaved", color: "text-[color:var(--warning)]" },
    saving: { icon: <Save className="h-3.5 w-3.5 animate-pulse" />, label: "Saving…", color: "text-muted-foreground" },
    saved: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Saved", color: "text-[color:var(--success)]" },
  };
  const s = map[state];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", s.color)}>
      {s.icon} {s.label}
    </span>
  );
}

function TypeSelector({ value, onChange }: { value: NoteType; onChange: (t: NoteType) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-surface-2 p-0.5 text-[10px]">
      {NOTE_TYPES.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cn(
            "rounded-sm px-1.5 py-0.5 capitalize transition-colors",
            value === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function FolderSelector({
  folders,
  value,
  onChange,
}: {
  folders: Array<{ id: string; name: string; icon: string | null }>;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px]">
      <Folder className="h-3 w-3 text-muted-foreground" />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="bg-transparent text-foreground outline-none"
      >
        <option value="">No folder</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function OutgoingLinks({ body, selfId, selfTitle }: { body: string; selfId: string; selfTitle: string }) {
  const project = useActiveProject();
  const notes = useNotes(project?.id);
  const targets = React.useMemo(() => {
    if (!notes) return [];
    const re = /\[\[([^\[\]\n]+?)\]\]/g;
    const set = new Map<string, string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const t = m[1].trim();
      set.set(slugify(t), t);
    }
    return Array.from(set.entries())
      .map(([slug, label]) => {
        const hit = notes.find((n) => slugify(n.title) === slug);
        return { slug, label, note: hit };
      })
      .filter((x) => !(x.note && x.note.id === selfId) && x.label.toLowerCase() !== selfTitle.toLowerCase());
  }, [body, notes, selfId, selfTitle]);

  if (targets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Reference other notes with <code className="rounded bg-muted px-1">[[Title]]</code>.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {targets.map((t) => (
        <li key={t.slug} className="flex items-center gap-2 text-xs">
          <TagIcon className="h-3 w-3 text-muted-foreground" />
          {t.note ? (
            <Link href={`/brain/${t.note.id}`} className="text-primary hover:underline">
              {t.label}
            </Link>
          ) : (
            <span className="text-muted-foreground">{t.label} <span className="opacity-60">(unlinked)</span></span>
          )}
        </li>
      ))}
    </ul>
  );
}

function deriveExcerpt(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
