"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FuseResultMatch } from "fuse.js";
import { Search, CornerDownLeft } from "lucide-react";
import {
  buildSearchItems,
  createSearchIndex,
  kindLabel,
  type SearchItem,
  type SearchKind,
} from "@/lib/utils/search";
import { highlightSegments, snippetAround, type Segment } from "@/lib/highlight";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { reindexProject } from "@/lib/ai/embedding-sync";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";

const KIND_DOT: Record<SearchKind, string> = {
  note: "bg-node-note",
  spec: "bg-node-spec",
  task: "bg-node-task",
  standard: "bg-node-research",
  memory: "bg-node-mechanic",
  devlog: "bg-node-idea",
  doc: "bg-node-lore",
  system: "bg-node-system",
};

interface Ranked {
  item: SearchItem;
  score: number;
  matches: readonly FuseResultMatch[];
}

function indicesFor(
  matches: readonly FuseResultMatch[],
  key: string,
): readonly (readonly [number, number])[] {
  return matches.find((m) => m.key === key)?.indices ?? [];
}

function Highlighted({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.hit ? (
          <mark
            key={i}
            className="rounded-[2px] bg-primary/25 text-foreground"
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export function SearchView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const { defaultMode, resultsPerPage } = usePageSettings((s) => s.search);
  const perPage = Number(resultsPerPage);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Set<SearchKind> | null>(null);
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let on = true;
    buildSearchItems(projectId ?? undefined).then((r) => {
      if (on) setItems(r);
    });
    return () => {
      on = false;
    };
  }, [projectId]);

  // Freshen the local AI service's index for this project when the page
  // opens — a no-op if the service isn't running (see embedding-sync.ts).
  useEffect(() => {
    if (projectId) void reindexProject(projectId);
  }, [projectId]);

  // Health-check the local AI service once — semantic/hybrid modes fall back
  // to Fuse when it isn't reachable.
  const [semanticHealthy, setSemanticHealthy] = useState(false);
  useEffect(() => {
    let on = true;
    fetch("/api/python/health")
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => {
        if (on) setSemanticHealthy(d.ok === true);
      })
      .catch(() => {
        if (on) setSemanticHealthy(false);
      });
    return () => {
      on = false;
    };
  }, []);

  // Debounced real semantic search against the local AI service. Results are
  // mapped back to the local `items` so existing highlighting/snippet/href
  // rendering can be reused as-is. `semanticQueryFor` tracks which query
  // `semanticItems` answers, so the `ranked` memo below can ignore stale
  // results without needing to eagerly clear state from this effect.
  const [semanticItems, setSemanticItems] = useState<SearchItem[]>([]);
  const [semanticQueryFor, setSemanticQueryFor] = useState<string | null>(null);
  useEffect(() => {
    const q = query.trim();
    const wantsSemantic = defaultMode === "semantic" || defaultMode === "hybrid";
    if (!wantsSemantic || !semanticHealthy || !q || !projectId) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      fetch("/api/python/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, query: q, limit: perPage * 2 }),
      })
        .then((res) => res.json())
        .then((data: { ok?: boolean; results?: { id: string; kind: SearchKind }[] }) => {
          if (cancelled || !data.ok || !data.results) return;
          const byKey = new Map(items.map((it) => [`${it.kind}:${it.id}`, it]));
          const mapped = data.results
            .map((r) => byKey.get(`${r.kind}:${r.id}`))
            .filter((it): it is SearchItem => Boolean(it));
          setSemanticItems(mapped);
          setSemanticQueryFor(q);
        })
        .catch(() => {
          /* local AI service unavailable — ranked memo falls back to Fuse */
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [defaultMode, semanticHealthy, query, projectId, items, perPage]);

  const fuse = useMemo(() => createSearchIndex(items), [items]);

  // Kinds present in the corpus, and per-kind counts.
  const kindCounts = useMemo(() => {
    const counts = new Map<SearchKind, number>();
    for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
    return counts;
  }, [items]);

  const ranked = useMemo<Ranked[]>(() => {
    const q = query.trim();
    if (!q) {
      return items.map((item) => ({
        item,
        score: 0,
        matches: [] as FuseResultMatch[],
      }));
    }
    const substringMatch = (needle: string) =>
      items.filter(
        (it) =>
          it.title.toLowerCase().includes(needle) ||
          it.body.toLowerCase().includes(needle) ||
          (it.subtitle?.toLowerCase().includes(needle) ?? false),
      );
    const fuzzy = () =>
      fuse.search(q).map((r) => ({
        item: r.item,
        score: r.score ?? 0,
        matches: r.matches ?? [],
      }));
    const noMatch = (item: SearchItem): Ranked => ({
      item,
      score: 0,
      matches: [] as FuseResultMatch[],
    });
    // Only trust semanticItems when they actually answer the current query —
    // the debounced fetch may not have resolved yet for a just-typed query.
    const semanticReady = semanticHealthy && semanticQueryFor === q;

    // Keyword mode: exact case-insensitive substring match (no fuzzy).
    if (defaultMode === "keyword") {
      return substringMatch(q.toLowerCase()).map(noMatch);
    }

    // Semantic: real vector search via the local AI service when reachable
    // (see the debounced effect above); Fuse fuzzy search otherwise.
    if (defaultMode === "semantic") {
      if (semanticReady && semanticItems.length > 0) {
        return semanticItems.map(noMatch);
      }
      return fuzzy();
    }

    // Hybrid: merge semantic vector results with keyword substring hits,
    // deduped, semantic first (higher relevance signal) — not a full
    // BM25+dense fusion, just a simple union.
    const keywordItems = substringMatch(q.toLowerCase());
    const seen = new Set<string>();
    const merged: SearchItem[] = [];
    for (const it of semanticReady ? semanticItems : []) {
      const key = `${it.kind}:${it.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(it);
    }
    for (const it of keywordItems) {
      const key = `${it.kind}:${it.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(it);
    }
    if (merged.length === 0) return fuzzy();
    return merged.map(noMatch);
  }, [query, items, fuse, defaultMode, semanticHealthy, semanticItems, semanticQueryFor]);

  const results = useMemo(() => {
    const filtered = active
      ? ranked.filter((r) => active.has(r.item.kind))
      : ranked;
    return filtered.slice(0, perPage);
  }, [ranked, active, perPage]);

  function toggleKind(kind: SearchKind) {
    setSelected(0);
    setActive((prev) => {
      const base = prev ?? new Set(kindCounts.keys());
      const next = new Set(base);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next.size === kindCounts.size ? null : next;
    });
  }

  function open(r: Ranked) {
    router.push(r.item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && results[selected]) {
      e.preventDefault();
      open(results[selected]);
    }
  }

  // Keep the selected row in view as the user arrows through.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${selected}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="flex h-full flex-col">
      {/* Search field */}
      <div className="border-b border-border p-4">
        <div className="relative mx-auto max-w-3xl">
          <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search across notes, specs, tasks, docs, systems, standards…"
            className="h-11 pl-10 text-base"
          />
        </div>

        {/* Kind filters */}
        <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center gap-1.5">
          {[...kindCounts.keys()].map((kind) => {
            const on = !active || active.has(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggleKind(kind)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  on
                    ? "border-border bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/50",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", KIND_DOT[kind])} />
                {kindLabel(kind)}
                <span className="text-muted-foreground">
                  {kindCounts.get(kind)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        <div ref={listRef} className="mx-auto max-w-3xl p-4">
          {items.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing to search yet"
              description="Create some notes, specs, or docs — or load the demo data — then search across everything from here."
            />
          ) : results.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No matches for “{query}”.
            </p>
          ) : (
            <>
              <p className="mb-2 px-1 text-xs text-muted-foreground">
                {query.trim()
                  ? `${results.length} result${results.length === 1 ? "" : "s"}`
                  : `${results.length} item${results.length === 1 ? "" : "s"}`}
              </p>
              <ul className="space-y-1">
                {results.map((r, i) => {
                  const titleSegs = highlightSegments(
                    r.item.title,
                    indicesFor(r.matches, "title"),
                  );
                  const bodySnip = snippetAround(
                    r.item.body,
                    indicesFor(r.matches, "body"),
                  );
                  const bodySegs = highlightSegments(
                    bodySnip.text,
                    bodySnip.ranges,
                  );
                  return (
                    <li key={`${r.item.kind}-${r.item.id}`}>
                      <button
                        type="button"
                        data-idx={i}
                        onClick={() => open(r)}
                        onMouseEnter={() => setSelected(i)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          i === selected
                            ? "border-border bg-accent"
                            : "border-transparent hover:bg-accent/40",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            KIND_DOT[r.item.kind],
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              <Highlighted segments={titleSegs} />
                            </span>
                            <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                              {kindLabel(r.item.kind)}
                            </span>
                          </div>
                          {r.item.subtitle && (
                            <div className="truncate text-xs text-muted-foreground">
                              {r.item.subtitle}
                            </div>
                          )}
                          {bodySnip.text && (
                            <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80">
                              <Highlighted segments={bodySegs} />
                            </div>
                          )}
                        </div>
                        {i === selected && (
                          <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
