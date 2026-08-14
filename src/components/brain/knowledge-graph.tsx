"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceRadial,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { useLiveQuery } from "dexie-react-hooks";
import { Maximize2, Network, Search } from "lucide-react";
import {
  notesRepo,
  specsRepo,
  tasksRepo,
  systemsRepo,
  commitsRepo,
  linksRepo,
} from "@/lib/db/repos";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { GRAPH_VAR, GRAPH_KIND_LABEL, type GraphKind } from "@/lib/colors";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  NoteDetailPanel,
  type EntityCategory,
  type SelectedGraphNode,
} from "./note-detail-panel";

const W = 960;
const H = 660;

interface GNode extends SimulationNodeDatum {
  key: string;
  kind: GraphKind;
  category: EntityCategory;
  refId: string;
  label: string;
}
type GLink = SimulationLinkDatum<GNode>;

const RADIUS: Record<EntityCategory, number> = {
  note: 9,
  spec: 12,
  task: 9,
  system: 12,
  commit: 7,
};

const LEGEND: GraphKind[] = [
  "idea",
  "system",
  "mechanic",
  "research",
  "experiment",
  "decision",
  "lore",
  "note",
  "spec",
  "task",
  "commit",
];

/** Filterable entity categories, with a label and a representative color. */
const CATEGORIES: { id: EntityCategory; label: string; var: string }[] = [
  { id: "note", label: "Notes", var: "--node-note" },
  { id: "spec", label: "Specs", var: "--node-spec" },
  { id: "task", label: "Tasks", var: "--node-task" },
  { id: "system", label: "Systems", var: "--node-system" },
  { id: "commit", label: "Commits", var: "--node-commit" },
];
const ALL_CATEGORIES = CATEGORIES.map((c) => c.id);

function linkEnd(end: GLink["source"]): string {
  return typeof end === "string" ? end : (end as GNode).key;
}

/** Best-effort relation label for an edge, derived from its endpoints. */
function linkRelation(a: EntityCategory, b: EntityCategory): string {
  const pair = [a, b].sort().join("-");
  const map: Record<string, string> = {
    "note-note": "links",
    "spec-task": "implements",
    "note-spec": "informs",
    "spec-spec": "relates",
    "system-system": "depends",
    "commit-spec": "delivers",
  };
  return map[pair] ?? "linked";
}

export function KnowledgeGraph({
  initialCategories,
}: {
  /** Entity categories shown on first render. Defaults to all. */
  initialCategories?: EntityCategory[];
} = {}) {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { layout, showOrphans, showEdgeLabels } = usePageSettings(
    (s) => s.knowledge,
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const rafRef = useRef<number | null>(null);
  const drag = useRef<{
    mode: "none" | "pan" | "node";
    node?: GNode;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  }>({ mode: "none", sx: 0, sy: 0, ox: 0, oy: 0 });

  const [gnodes, setGnodes] = useState<GNode[]>([]);
  const [glinks, setGlinks] = useState<GLink[]>([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const defaultCategories = useMemo(() => {
    const catParam = searchParams.get("categories");
    if (catParam) {
      const cats = catParam.split(",") as EntityCategory[];
      return cats.filter((c) => ALL_CATEGORIES.includes(c));
    }
    return initialCategories ?? ALL_CATEGORIES;
  }, [searchParams, initialCategories]);

  const [activeCats, setActiveCats] = useState<Set<EntityCategory>>(
    () => new Set(defaultCategories),
  );
  const [query, setQuery] = useState("");

  const data = useLiveQuery(async () => {
    if (!projectId) return { nodes: [] as GNode[], links: [] as GLink[] };
    const [notes, specs, tasks, systems, commits, links] = await Promise.all([
      notesRepo.listByProject(projectId),
      specsRepo.listByProject(projectId),
      tasksRepo.listByProject(projectId),
      systemsRepo.listByProject(projectId),
      commitsRepo.listByProject(projectId),
      linksRepo.listByProject(projectId),
    ]);
    const nodes: GNode[] = [];
    const keys = new Set<string>();
    const add = (
      key: string,
      kind: GraphKind,
      category: EntityCategory,
      refId: string,
      label: string,
    ) => {
      nodes.push({ key, kind, category, refId, label });
      keys.add(key);
    };
    notes.forEach((n) => add(`note:${n.id}`, n.type, "note", n.id, n.title));
    specs.forEach((s) => add(`spec:${s.id}`, "spec", "spec", s.id, s.number));
    tasks.forEach((t) => add(`task:${t.id}`, "task", "task", t.id, t.title));
    systems.forEach((s) =>
      add(`system:${s.id}`, "system", "system", s.id, s.name),
    );
    commits.forEach((c) =>
      add(`commit:${c.id}`, "commit", "commit", c.id, c.sha.slice(0, 7)),
    );

    const edges: GLink[] = [];
    const edge = (a: string, b: string) => {
      if (a !== b && keys.has(a) && keys.has(b)) {
        edges.push({ source: a, target: b });
      }
    };
    links
      .filter(
        (l) =>
          l.linkType === "wikilink" &&
          l.sourceType === "note" &&
          l.targetType === "note",
      )
      .forEach((l) => edge(`note:${l.sourceId}`, `note:${l.targetId}`));
    tasks.forEach((t) => t.specId && edge(`task:${t.id}`, `spec:${t.specId}`));
    specs.forEach((s) => {
      s.linkedNoteIds.forEach((id) => edge(`spec:${s.id}`, `note:${id}`));
      s.linkedTaskIds.forEach((id) => edge(`spec:${s.id}`, `task:${id}`));
    });
    systems.forEach((s) =>
      s.dependencies.forEach((dep) => edge(`system:${s.id}`, `system:${dep}`)),
    );
    commits.forEach((c) =>
      c.linkedSpecIds.forEach((id) => edge(`commit:${c.id}`, `spec:${id}`)),
    );
    return { nodes, links: edges };
  }, [projectId]);

  // Restrict the graph to the active entity categories. Links survive only when
  // both endpoints are still visible.
  const filtered = useMemo(() => {
    let nodes = (data?.nodes ?? []).filter((n) => activeCats.has(n.category));
    const visible = new Set(nodes.map((n) => n.key));
    const links = (data?.links ?? []).filter(
      (l) => visible.has(linkEnd(l.source)) && visible.has(linkEnd(l.target)),
    );
    // Hide orphan nodes (no surviving connections) when disabled.
    if (!showOrphans) {
      const connected = new Set<string>();
      for (const l of links) {
        connected.add(linkEnd(l.source));
        connected.add(linkEnd(l.target));
      }
      nodes = nodes.filter((n) => connected.has(n.key));
    }
    return { nodes, links };
  }, [data, activeCats, showOrphans]);

  useEffect(() => {
    const nodes = filtered.nodes.map((n) => ({ ...n }));
    const links = filtered.links.map((l) => ({ ...l }));
    // Seed React state from the d3-force simulation (an external system that
    // owns layout and mutates these objects on every tick).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGnodes(nodes);
    setGlinks(links);

    const sim = forceSimulation<GNode>(nodes)
      .force("charge", forceManyBody().strength(-260))
      .force(
        "link",
        forceLink<GNode, GLink>(links)
          .id((d) => d.key)
          .distance(74)
          .strength(0.4),
      )
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide(28));
    // Radial layout: pull nodes onto a ring around the center.
    if (layout === "radial") {
      sim.force(
        "radial",
        forceRadial<GNode>(Math.min(W, H) / 2 - 70, W / 2, H / 2).strength(0.55),
      );
    }
    // Batch per-tick state updates through a single animation frame so large
    // graphs re-render at most once per frame instead of once per tick.
    sim.on("tick", () => {
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setGnodes((cur) => [...cur]);
        });
      }
    });
    simRef.current = sim;
    return () => {
      sim.stop();
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [filtered, layout]);

  const selectedNode: SelectedGraphNode | null = (() => {
    const n = gnodes.find((x) => x.key === selectedKey);
    if (!n) return null;
    return {
      key: n.key,
      category: n.category,
      refId: n.refId,
      label: n.label,
      kind: n.kind,
    };
  })();

  function clientToSvg(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = clientToSvg(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setTransform((t) => {
      const k = Math.min(3, Math.max(0.25, t.k * factor));
      const wx = (p.x - t.x) / t.k;
      const wy = (p.y - t.y) / t.k;
      return { k, x: p.x - wx * k, y: p.y - wy * k };
    });
  }

  // React's root-level wheel listener is passive, so preventDefault() there
  // can't stop the browser's own zoom/scroll. Attach a native non-passive
  // listener directly to the svg instead.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function onPointerDownBackground(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      mode: "pan",
      sx: e.clientX,
      sy: e.clientY,
      ox: transform.x,
      oy: transform.y,
    };
  }

  function onPointerDownNode(e: React.PointerEvent, node: GNode) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      mode: "node",
      node,
      sx: e.clientX,
      sy: e.clientY,
      ox: 0,
      oy: 0,
    };
    simRef.current?.alphaTarget(0.3).restart();
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (d.mode === "none") return;
    const rect = svgRef.current!.getBoundingClientRect();
    if (d.mode === "pan") {
      const dx = ((e.clientX - d.sx) / rect.width) * W;
      const dy = ((e.clientY - d.sy) / rect.height) * H;
      setTransform((t) => ({ ...t, x: d.ox + dx, y: d.oy + dy }));
    } else if (d.mode === "node" && d.node) {
      const p = clientToSvg(e.clientX, e.clientY);
      d.node.fx = (p.x - transform.x) / transform.k;
      d.node.fy = (p.y - transform.y) / transform.k;
      setGnodes((cur) => [...cur]);
    }
  }

  function onPointerUp() {
    const d = drag.current;
    if (d.mode === "node" && d.node) {
      d.node.fx = null;
      d.node.fy = null;
      simRef.current?.alphaTarget(0);
    }
    drag.current = { mode: "none", sx: 0, sy: 0, ox: 0, oy: 0 };
  }

  function openEntity(category: EntityCategory, refId: string) {
    const routes: Record<EntityCategory, string> = {
      note: `/brain?note=${refId}`,
      spec: `/specs?spec=${refId}`,
      task: `/tasks?task=${refId}`,
      system: `/architecture?system=${refId}`,
      commit: "/dashboard",
    };
    router.push(routes[category]);
  }

  function toggleCat(cat: EntityCategory) {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const hasData = (data?.nodes.length ?? 0) > 0;

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        {!hasData ? (
          <EmptyState
            icon={Network}
            title="Nothing to graph yet"
            description="Create notes and link them with [[wikilinks]], or load the demo data to see the knowledge graph come alive."
            className="h-full"
          />
        ) : (
          <>
            <div className="absolute top-3 left-3 z-10 flex max-w-[60%] flex-col gap-2">
              <div className="relative">
                <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Focus nodes…"
                  className="h-8 w-56 rounded-md border border-border bg-card/80 pr-2 pl-7 text-sm outline-none backdrop-blur placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => {
                  const on = activeCats.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCat(c.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] backdrop-blur transition-colors",
                        on
                          ? "border-border bg-card/80 text-foreground"
                          : "border-transparent bg-card/40 text-muted-foreground/60",
                      )}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: on ? `var(${c.var})` : "currentColor",
                          opacity: on ? 1 : 0.4,
                        }}
                      />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="absolute top-3 right-3 z-10">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTransform({ x: 0, y: 0, k: 1 });
                  simRef.current?.alpha(0.6).restart();
                }}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Reset view
              </Button>
            </div>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="h-full w-full touch-none select-none"
              onPointerDown={onPointerDownBackground}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <g
                transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
              >
                {glinks.map((l, i) => {
                  const s = l.source as GNode;
                  const t = l.target as GNode;
                  if (
                    s?.x == null ||
                    s?.y == null ||
                    t?.x == null ||
                    t?.y == null
                  )
                    return null;
                  return (
                    <g key={i}>
                      <line
                        x1={s.x}
                        y1={s.y}
                        x2={t.x}
                        y2={t.y}
                        className="stroke-border"
                        strokeWidth={1}
                        strokeOpacity={0.7}
                      />
                      {showEdgeLabels && (
                        <text
                          x={(s.x + t.x) / 2}
                          y={(s.y + t.y) / 2}
                          textAnchor="middle"
                          className="pointer-events-none fill-muted-foreground/70 text-[7px]"
                        >
                          {linkRelation(s.category, t.category)}
                        </text>
                      )}
                    </g>
                  );
                })}
                {gnodes.map((n) => {
                  if (n.x == null || n.y == null) return null;
                  const selected = n.key === selectedKey;
                  const dimmed = q !== "" && !n.label.toLowerCase().includes(q);
                  return (
                    <g
                      key={n.key}
                      transform={`translate(${n.x},${n.y})`}
                      className="cursor-pointer"
                      opacity={dimmed ? 0.2 : 1}
                      onPointerDown={(e) => onPointerDownNode(e, n)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedKey(n.key);
                      }}
                    >
                      <circle
                        r={RADIUS[n.category] + (selected ? 3 : 0)}
                        style={{ fill: `var(${GRAPH_VAR[n.kind]})` }}
                        className={
                          selected ? "stroke-foreground" : "stroke-background"
                        }
                        strokeWidth={selected ? 2 : 1.5}
                      />
                      <text
                        y={RADIUS[n.category] + 12}
                        textAnchor="middle"
                        className="pointer-events-none fill-muted-foreground text-[9px]"
                      >
                        {n.label.length > 22
                          ? `${n.label.slice(0, 22)}…`
                          : n.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            <div className="absolute bottom-3 left-3 z-10 flex max-w-md flex-wrap gap-x-3 gap-y-1 rounded-md border border-border bg-card/80 p-2 backdrop-blur">
              {LEGEND.map((kind) => (
                <span
                  key={kind}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: `var(${GRAPH_VAR[kind]})` }}
                  />
                  {GRAPH_KIND_LABEL[kind]}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {selectedNode ? (
        <NoteDetailPanel
          node={selectedNode}
          onClose={() => setSelectedKey(null)}
          onSelectNote={(id) => setSelectedKey(`note:${id}`)}
          onOpen={openEntity}
        />
      ) : null}
    </div>
  );
}
