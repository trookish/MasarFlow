"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Brain,
  Plus,
  Search,
  Folder,
  Hash,
  ArrowRight,
  LayoutGrid,
  FileText,
  CheckSquare,
  Square,
  Trash2,
  TagIcon,
  X,
} from "lucide-react";
import { getDb } from "@/lib/db/schema";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoteTypeBadge } from "@/components/common/badges";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useNotes } from "@/lib/db/repos/notes";
import { useFolders, useTags } from "@/lib/db/repos/misc";
import { useCanvases, createCanvas } from "@/lib/db/repos/canvases";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { VaultModeBadge } from "@/components/vault/vault-mode-badge";
import { useVault } from "@/lib/stores/vault";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownTransferDialog } from "@/components/brain/markdown-transfer-dialog";

const TYPE_ACCENT: Record<string, string> = {
  idea: "var(--graph-idea)",
  system: "var(--graph-system)",
  mechanic: "var(--graph-task)",
  research: "var(--graph-doc)",
  experiment: "var(--graph-arch)",
  note: "var(--graph-note)",
  lore: "var(--graph-memory)",
  decision: "var(--graph-spec)",
};

export default function BrainPage() {
  const _settings = useVault((s) => s.settings);
  const router = useRouter();
  const project = useActiveProject();
  const notes = useNotes(project?.id);
  const folders = useFolders(project?.id);
  const tags = useTags();
  const canvases = useCanvases(project?.id);
  const [q, setQ] = React.useState("");
  const [activeFolder, setActiveFolder] = React.useState<string | null>(null);
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"notes" | "canvases">("notes");

  const [isSelectMode, setIsSelectMode] = React.useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = React.useState<string[]>([]);

  const [canvasDialogOpen, setCanvasDialogOpen] = React.useState(false);
  const [mdTransferOpen, setMdTransferOpen] = React.useState(false);
  const [canvasName, setCanvasName] = React.useState("");

  const filteredNotes = React.useMemo(() => {
    return (notes ?? []).filter((n) => {
      if (activeFolder && n.folderId !== activeFolder) return false;
      if (activeTag && !n.tags.includes(activeTag)) return false;
      if (
        q &&
        !`${n.title} ${n.body} ${n.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [notes, q, activeFolder, activeTag]);

  const filteredCanvases = React.useMemo(() => {
    return (canvases ?? []).filter((c) =>
      q ? c.name.toLowerCase().includes(q.toLowerCase()) : true,
    );
  }, [canvases, q]);

  const onCreateCanvas = async () => {
    if (!project) return;
    try {
      const canvas = await createCanvas(project.id, canvasName);
      toast.success("Canvas created");
      router.push(`/brain/canvas/${canvas.id}`);
    } catch (e) {
      toast.error("Failed to create canvas", { description: (e as Error).message });
    }
  };

  return (
    <div className="pb-10">
      <PageHeader
        icon={Brain}
        eyebrow="Brain"
        title="Permanent project memory"
        description="Ideas, systems, mechanics, research, decisions, lore, and visual canvases. Every note links bidirectionally to specs, tasks, architecture, and code."
        actions={
          <div className="flex items-center gap-2">
            <VaultModeBadge />
            <Button variant="outline" size="sm" onClick={() => setMdTransferOpen(true)}>
              Import/Export MD
            </Button>
            {tab === "notes" && (
              <Button
                variant={isSelectMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  if (isSelectMode) setSelectedNoteIds([]);
                }}
              >
                {isSelectMode ? "Cancel Select" : "Select"}
              </Button>
            )}
            {tab === "canvases" ? (
              <Button onClick={() => setCanvasDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> New canvas
              </Button>
            ) : (
              <>
                <Button variant="outline" asChild className="gap-2">
                  <Link href="/brain/graph">Graph</Link>
                </Button>
                <Button variant="outline" asChild className="gap-2">
                  <Link href="/brain/templates">Templates</Link>
                </Button>
                <Button asChild className="gap-2">
                  <Link href="/brain/new">
                    <Plus className="h-4 w-4" /> New note
                  </Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="border-border flex items-center gap-4 border-b px-6">
        <button
          onClick={() => setTab("notes")}
          className={cn(
            "relative flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
            tab === "notes"
              ? "border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          <FileText className="h-4 w-4" /> Notes
          <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0 text-[10px]">
            {notes?.length ?? 0}
          </span>
        </button>
        <button
          onClick={() => setTab("canvases")}
          className={cn(
            "relative flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
            tab === "canvases"
              ? "border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          <LayoutGrid className="h-4 w-4" /> Canvases
          <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0 text-[10px]">
            {canvases?.length ?? 0}
          </span>
        </button>
      </div>

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <aside className="space-y-4 lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Browse</CardDescription>
              <CardTitle className="mt-1 text-sm">Folders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <button
                onClick={() => setActiveFolder(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  activeFolder === null
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/40",
                )}
              >
                <Folder className="h-3.5 w-3.5" /> All
                <span className="ml-auto text-[10px]">{notes?.length ?? 0}</span>
              </button>
              {folders?.map((f) => {
                const count = notes?.filter((n) => n.folderId === f.id).length ?? 0;
                return (
                  <button
                    key={f.id}
                    onClick={() => setActiveFolder(f.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      activeFolder === f.id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/40",
                    )}
                  >
                    <Folder className="h-3.5 w-3.5" /> {f.name}
                    <span className="ml-auto text-[10px]">{count}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Boards</CardDescription>
              <CardTitle className="mt-1 text-sm">Canvases</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <Link
                href="/brain/canvas"
                className="text-muted-foreground hover:bg-accent/40 hover:text-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> All canvases
                <span className="ml-auto text-[10px]">{canvases?.length ?? 0}</span>
              </Link>
              {canvases?.map((c) => (
                <Link
                  key={c.id}
                  href={`/brain/canvas/${c.id}`}
                  className="text-muted-foreground hover:bg-accent/40 hover:text-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> {c.name}
                </Link>
              ))}
            </CardContent>
          </Card>

          {tab === "notes" && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Filter</CardDescription>
                <CardTitle className="mt-1 text-sm">Tags</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {tags?.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTag(activeTag === t.name ? null : t.name)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                      activeTag === t.name
                        ? "border-foreground/30 bg-foreground/10"
                        : "border-border text-muted-foreground hover:border-foreground/30",
                    )}
                  >
                    <Hash className="h-2.5 w-2.5" /> {t.name}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tips</CardDescription>
              <CardTitle className="mt-1 text-sm">
                {tab === "canvases" ? "Canvases" : "Editing"}
              </CardTitle>
            </CardHeader>
              <CardContent className="text-muted-foreground space-y-1.5 text-xs">
                {tab === "canvases" ? (
                  <>
                    <p>Drag nodes to reposition. Positions save automatically.</p>
                    <p>Use Delete or Backspace to remove selected nodes.</p>
                  </>
                ) : (
                  <>
                    <p>Open a note to edit, link, and tag it.</p>
                    <p>
                      Use <code className="bg-muted rounded px-1">[[Title]]</code> to link notes
                      together.
                    </p>
                    <p>
                      Use <code className="bg-muted rounded px-1">#tag</code> in the body to
                      auto-tag.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
        </aside>

        <div className="space-y-3 lg:col-span-9">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5" />
            <Input
              placeholder={tab === "canvases" ? "Search canvases…" : "Search notes…"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>

          {tab === "canvases" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredCanvases.map((c) => (
                <Link
                  key={c.id}
                  href={`/brain/canvas/${c.id}`}
                  className="group border-border bg-card hover:border-border/80 hover:bg-accent/20 relative flex flex-col gap-2 rounded-lg border p-4 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="text-muted-foreground h-4 w-4" />
                    <span className="text-sm font-semibold">{c.name}</span>
                    <span className="text-muted-foreground ml-auto text-[10px]">
                      {formatRelativeTime(c.updatedAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Open board to add and arrange nodes.
                  </p>
                  <ArrowRight className="text-muted-foreground absolute top-3 right-3 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
              {filteredCanvases.length === 0 && (
                <div className="border-border text-muted-foreground col-span-full rounded-lg border border-dashed p-10 text-center text-sm">
                  {canvases?.length === 0 ? (
                    <div className="space-y-3">
                      <p>No canvases yet.</p>
                      <Button onClick={() => setCanvasDialogOpen(true)} variant="outline" size="sm">
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Create canvas
                      </Button>
                    </div>
                  ) : (
                    "No canvases match this search."
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredNotes.map((n) => {
                const isSelected = selectedNoteIds.includes(n.id);
                const toggleSelect = () => {
                  if (isSelected) {
                    setSelectedNoteIds(s => s.filter(id => id !== n.id));
                  } else {
                    setSelectedNoteIds(s => [...s, n.id]);
                  }
                };

                const content = (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: TYPE_ACCENT[n.type] }}
                      />
                      <NoteTypeBadge type={n.type} />
                      <span className="text-muted-foreground ml-auto text-[10px]">
                        {formatRelativeTime(n.updatedAt)}
                      </span>
                    </div>
                    <h3 className="text-sm leading-snug font-semibold flex items-start justify-between gap-2">
                      <span>{n.title}</span>
                      {isSelectMode && (
                        <span className="text-muted-foreground">
                          {isSelected ? <CheckSquare className="h-4 w-4 text-[color:var(--primary)]" /> : <Square className="h-4 w-4" />}
                        </span>
                      )}
                    </h3>
                    <p className="text-muted-foreground line-clamp-3 text-xs text-pretty">
                      {n.excerpt}
                    </p>
                    {n.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {n.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="bg-muted text-muted-foreground inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px]"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    {!isSelectMode && (
                      <ArrowRight className="text-muted-foreground absolute top-3 right-3 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </>
                );

                const className = cn(
                  "group border-border relative flex flex-col gap-2 rounded-lg border p-4 transition-all",
                  isSelectMode ? (isSelected ? "bg-accent/40 border-primary" : "bg-card hover:bg-accent/20") : "bg-card hover:border-border/80 hover:bg-accent/20"
                );

                if (isSelectMode) {
                  return (
                    <div key={n.id} onClick={toggleSelect} className={cn(className, "cursor-pointer")}>
                      {content}
                    </div>
                  );
                }

                return (
                  <Link key={n.id} href={`/brain/${n.id}`} className={className}>
                    {content}
                  </Link>
                );
              })}
              {filteredNotes.length === 0 && (
                <div className="border-border text-muted-foreground col-span-full rounded-lg border border-dashed p-10 text-center text-sm">
                  No notes match this filter.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={canvasDialogOpen} onOpenChange={setCanvasDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New canvas</DialogTitle>
            <DialogDescription>Give your board a name to get started.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              autoFocus
              value={canvasName}
              onChange={(e) => setCanvasName(e.target.value)}
              placeholder="e.g. Traversal Design Board"
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateCanvas();
                if (e.key === "Escape") setCanvasDialogOpen(false);
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCanvasDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onCreateCanvas}>Create canvas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MarkdownTransferDialog 
        open={mdTransferOpen} 
        onOpenChange={setMdTransferOpen} 
        mode="both" 
      />

      {isSelectMode && selectedNoteIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground shadow-lg border border-border rounded-full px-4 py-2 flex items-center gap-4 z-50 animate-in slide-in-from-bottom-5">
          <span className="text-sm font-medium">{selectedNoteIds.length} selected</span>
          <div className="h-4 w-px bg-border mx-2" />
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={async () => {
              if (confirm(`Delete ${selectedNoteIds.length} notes?`)) {
                await getDb().notes.bulkDelete(selectedNoteIds);
                toast.success(`${selectedNoteIds.length} notes deleted.`);
                setSelectedNoteIds([]);
                setIsSelectMode(false);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 gap-2"
            onClick={() => {
              const tag = prompt("Enter tag to add to selected notes (without #):");
              if (tag) {
                const trimmed = tag.trim().replace(/^#/, '');
                if (trimmed) {
                  getDb().transaction('rw', getDb().notes, async () => {
                    const selected = await getDb().notes.where('id').anyOf(selectedNoteIds).toArray();
                    for (const n of selected) {
                      if (!n.tags.includes(trimmed)) {
                        await getDb().notes.update(n.id, { tags: [...n.tags, trimmed] });
                      }
                    }
                  });
                  toast.success(`Added tag #${trimmed} to ${selectedNoteIds.length} notes.`);
                  setSelectedNoteIds([]);
                  setIsSelectMode(false);
                }
              }
            }}
          >
            <TagIcon className="h-3.5 w-3.5" /> Tag
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 rounded-full" onClick={() => { setIsSelectMode(false); setSelectedNoteIds([]); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
