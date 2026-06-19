"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, BookOpen, Search } from "lucide-react";
import { docsRepo } from "@/lib/db/repos";
import type { Doc } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocEditor } from "./doc-editor";

export function DocsView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("doc");
  const [query, setQuery] = useState("");

  const docsRaw = useLiveQuery(
    () => docsRepo.listByProject(projectId),
    [projectId],
  );
  const docs = useMemo(() => docsRaw ?? [], [docsRaw]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
  }, [docs, query]);

  // Group by category, categories sorted alphabetically, docs by title.
  const groups = useMemo(() => {
    const byCat = new Map<string, Doc[]>();
    for (const d of filtered) {
      const cat = d.category || "general";
      (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(d);
    }
    return [...byCat.entries()]
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [filtered]);

  const selected = docs.find((d) => d.id === selectedId) ?? null;

  function select(id: string | null) {
    router.replace(id ? `/docs?doc=${id}` : "/docs", { scroll: false });
  }

  async function createDoc() {
    if (!projectId) return;
    const doc = await docsRepo.create({
      projectId,
      title: "Untitled doc",
      category: "general",
    });
    select(doc.id);
  }

  async function deleteDoc() {
    if (!selected) return;
    await docsRepo.remove(selected.id);
    select(null);
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border p-2">
          <span className="px-1 text-sm font-medium">Documentation</span>
          <Button
            size="icon-sm"
            aria-label="New doc"
            onClick={createDoc}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search docs…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 p-2">
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {docs.length === 0 ? "No docs yet." : "No matches."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.category} className="mb-3">
                <p className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
                  {group.category}
                </p>
                {group.items.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => select(d.id)}
                    className={cn(
                      "mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                      d.id === selectedId
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{d.title}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Editor */}
      <div className="min-w-0 flex-1">
        {selected ? (
          <DocEditor key={selected.id} doc={selected} onDelete={deleteDoc} />
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No doc selected"
            description="Write project documentation in Markdown with live preview. Organize pages by category — guides, architecture, API, and more."
            action={
              <Button onClick={createDoc} disabled={!projectId}>
                <Plus className="h-4 w-4" /> New doc
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
