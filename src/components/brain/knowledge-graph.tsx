"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { useLiveQuery } from "dexie-react-hooks";
import { Maximize2, Network } from "lucide-react";
import {
  notesRepo,
  specsRepo,
  tasksRepo,
  systemsRepo,
  commitsRepo,
  linksRepo,
} from "@/lib/db/repos";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { GRAPH_VAR, GRAPH_KIND_LABEL, type GraphKind } from "@/lib/colors";
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

export function KnowledgeGraph() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
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

  useEffect(() => {
    if (!data) return;
    const nodes = data.nodes.map((n) => ({ ...n }));
    const links = data.links.map((l) => ({ ...l }));
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
    sim.on("tick", () => setGnodes((cur) => [...cur]));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [data]);

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

  function onWheel(e: React.WheelEvent) {
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
      spec: "/specs",
      task: "/tasks",
      system: "/architecture",
      commit: "/dashboard",
    };
    router.push(routes[category]);
  }

  const hasData = (data?.nodes.length ?? 0) > 0;

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        {!hasData ? (
          <EmptyState
            icon={Network}
            title="Nothing to graph yet"
            description="Create notes and link them with [[wikilinks]], or load the demo data to see the knowledge graph come alive."
          />
        ) : (
          <>
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
              onWheel={onWheel}
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
                    <line
                      key={i}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      className="stroke-border"
                      strokeWidth={1}
                      strokeOpacity={0.7}
                    />
                  );
                })}
                {gnodes.map((n) => {
                  if (n.x == null || n.y == null) return null;
                  const selected = n.key === selectedKey;
                  return (
                    <g
                      key={n.key}
                      transform={`translate(${n.x},${n.y})`}
                      className="cursor-pointer"
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
