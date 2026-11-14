"use client";
import * as React from "react";
import { Share2, Sparkles, Filter } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useNotes } from "@/lib/db/repos/notes";
import { useSpecs } from "@/lib/db/repos/specs";
import { useTasks, useSystems, useDocs, useCommits, useMemories, useLinks } from "@/lib/db/repos/misc";
import { cn } from "@/lib/utils";

type GNode = {
  id: string;
  label: string;
  kind: "note" | "spec" | "task" | "system" | "doc" | "commit" | "memory";
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type GEdge = { source: string; target: string };

const KIND_COLOR: Record<GNode["kind"], string> = {
  note: "var(--graph-note)",
  spec: "var(--graph-spec)",
  task: "var(--graph-task)",
  system: "var(--graph-system)",
  doc: "var(--graph-doc)",
  commit: "var(--graph-commit)",
  memory: "var(--graph-memory)",
};

const KIND_LABEL: Record<GNode["kind"], string> = {
  note: "Note",
  spec: "Spec",
  task: "Task",
  system: "System",
  doc: "Doc",
  commit: "Commit",
  memory: "Memory",
};

const ALL_KINDS: GNode["kind"][] = ["note", "spec", "task", "system", "doc", "commit", "memory"];

export default function KnowledgeGraphPage() {
  const project = useActiveProject();
  const notes = useNotes(project?.id);
  const specs = useSpecs(project?.id);
  const tasks = useTasks(project?.id);
  const systems = useSystems(project?.id);
  const docs = useDocs(project?.id);
  const commits = useCommits(project?.id);
  const memories = useMemories(project?.id);
  const globalLinks = useLinks(project?.id);

  const [enabled, setEnabled] = React.useState<Record<GNode["kind"], boolean>>({
    note: true,
    spec: true,
    task: true,
    system: true,
    doc: true,
    commit: true,
    memory: true,
  });
  const [hover, setHover] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const nodesRef = React.useRef<GNode[]>([]);
  const W = 800;
  const H = 480;

  const buildNodes = React.useCallback((): GNode[] => {
    const list: GNode[] = [];
    const seed = (i: number) => Math.sin(i * 12.9898) * 43758.5453;
    const rand = (i: number) => {
      const v = seed(i) - Math.floor(seed(i));
      return v;
    };
    notes?.forEach((n, i) =>
      list.push({
        id: `note_${n.id}`,
        label: n.title,
        kind: "note",
        x: W / 2 + (rand(i) - 0.5) * W * 0.7,
        y: H / 2 + (rand(i + 7) - 0.5) * H * 0.7,
        vx: 0,
        vy: 0,
      }),
    );
    specs?.forEach((s, i) =>
      list.push({
        id: `spec_${s.id}`,
        label: s.title,
        kind: "spec",
        x: W / 2 + (rand(i + 11) - 0.5) * W * 0.6,
        y: H / 2 + (rand(i + 13) - 0.5) * H * 0.6,
        vx: 0,
        vy: 0,
      }),
    );
    tasks?.forEach((t, i) =>
      list.push({
        id: `task_${t.id}`,
        label: t.title,
        kind: "task",
        x: W / 2 + (rand(i + 17) - 0.5) * W * 0.7,
        y: H / 2 + (rand(i + 19) - 0.5) * H * 0.7,
        vx: 0,
        vy: 0,
      }),
    );
    systems?.forEach((s, i) =>
      list.push({
        id: `sys_${s.id}`,
        label: s.name,
        kind: "system",
        x: W / 2 + (rand(i + 23) - 0.5) * W * 0.5,
        y: H / 2 + (rand(i + 29) - 0.5) * H * 0.5,
        vx: 0,
        vy: 0,
      }),
    );
    docs?.forEach((d, i) =>
      list.push({
        id: `doc_${d.id}`,
        label: d.title,
        kind: "doc",
        x: W / 2 + (rand(i + 31) - 0.5) * W * 0.7,
        y: H / 2 + (rand(i + 37) - 0.5) * H * 0.7,
        vx: 0,
        vy: 0,
      }),
    );
    commits?.forEach((c, i) =>
      list.push({
        id: `commit_${c.id}`,
        label: c.message.slice(0, 40),
        kind: "commit",
        x: W / 2 + (rand(i + 41) - 0.5) * W * 0.7,
        y: H / 2 + (rand(i + 43) - 0.5) * H * 0.7,
        vx: 0,
        vy: 0,
      }),
    );
    memories?.forEach((m, i) =>
      list.push({
        id: `memory_${m.id}`,
        label: m.content.slice(0, 40),
        kind: "memory",
        x: W / 2 + (rand(i + 47) - 0.5) * W * 0.7,
        y: H / 2 + (rand(i + 53) - 0.5) * H * 0.7,
        vx: 0,
        vy: 0,
      }),
    );
    return list;
  }, [notes, specs, tasks, systems, docs, commits, memories]);

  React.useEffect(() => {
    nodesRef.current = buildNodes();
  }, [buildNodes]);

  const [tick, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    let raf = 0;
    const step = () => {
      const ns = nodesRef.current;
      for (let i = 0; i < ns.length; i++) {
        const a = ns[i];
        if (!enabled[a.kind]) continue;
        let fx = 0;
        let fy = 0;
        for (let j = 0; j < ns.length; j++) {
          if (i === j) continue;
          const b = ns[j];
          if (!enabled[b.kind]) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const d = Math.sqrt(d2);
          const repulse = 800 / d2;
          fx += (dx / d) * repulse;
          fy += (dy / d) * repulse;
        }
        fx += (W / 2 - a.x) * 0.001;
        fy += (H / 2 - a.y) * 0.001;
        a.vx = (a.vx + fx * 0.002) * 0.85;
        a.vy = (a.vy + fy * 0.002) * 0.85;
        a.x += a.vx;
        a.y += a.vy;
        a.x = Math.max(20, Math.min(W - 20, a.x));
        a.y = Math.max(20, Math.min(H - 20, a.y));
      }
      force();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  const visibleNodes = React.useMemo(() => {
    void tick;
    // eslint-disable-next-line react-hooks/refs
    return nodesRef.current.filter((n) => enabled[n.kind]);
  }, [enabled, tick]);

  const nodeById = React.useMemo(() => {
    const m: Record<string, GNode> = {};
    visibleNodes.forEach((n) => (m[n.id] = n));
    return m;
  }, [visibleNodes]);

  const countsByKind = React.useMemo(() => {
    const c: Record<GNode["kind"], number> = {
      note: 0,
      spec: 0,
      task: 0,
      system: 0,
      doc: 0,
      commit: 0,
      memory: 0,
    };
    visibleNodes.forEach((n) => c[n.kind]++);
    return c;
  }, [visibleNodes]);

  const edges: GEdge[] = React.useMemo(() => {
    const es: GEdge[] = [];
    specs?.forEach((s) =>
      s.linkedNoteIds.forEach((nid) => es.push({ source: `spec_${s.id}`, target: `note_${nid}` })),
    );
    specs?.forEach((s) =>
      s.linkedTaskIds.forEach((tid) => es.push({ source: `spec_${s.id}`, target: `task_${tid}` })),
    );
    docs?.forEach((d) => {
      if (d.generatedFrom?.startsWith("spec_"))
        es.push({ source: `doc_${d.id}`, target: `spec_${d.generatedFrom}` });
    });
    globalLinks?.forEach((l) => {
      // Map system to sys, and others directly
      const sType = l.sourceType === "system" ? "sys" : l.sourceType;
      const tType = l.targetType === "system" ? "sys" : l.targetType;
      es.push({ source: `${sType}_${l.sourceId}`, target: `${tType}_${l.targetId}` });
    });
    return es.filter((e) => nodeById[e.source] && nodeById[e.target]);
  }, [specs, docs, globalLinks, nodeById]);

  const activeId = selectedId ?? hover;

  const getEntityHref = (id: string, kind: string) => {
    const realId = id.split("_")[1];
    switch (kind) {
      case "note": return `/brain/${realId}`;
      case "spec": return `/specs/${realId}`;
      case "doc": return `/docs/${realId}`;
      case "task": return `/tasks`;
      case "system": return `/architecture`;
      case "commit": return `/dev-logs`;
      default: return "#";
    }
  };

  return (
    <div className="pb-10 h-full flex flex-col">
      <PageHeader
        icon={Share2}
        eyebrow="Knowledge Graph"
        title="Everything connected"
        description="An interactive, force-directed view of how your ideas, specs, tasks, systems, docs, commits, and memory relate to one another."
        actions={
          <Button variant="soft" className="gap-2">
            <Sparkles className="h-4 w-4" /> Re-center
          </Button>
        }
      />

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12 flex-1">
        <Card className="lg:col-span-9 h-[600px] flex flex-col">
          <CardContent className="p-3 flex-1 flex flex-col relative">
            <div className="border-border bg-surface-2 absolute inset-3 overflow-hidden rounded-lg border">
              <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" onClick={() => setSelectedId(null)}>
                <defs>
                  <radialGradient id="kg-center" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle cx={W / 2} cy={H / 2} r="160" fill="url(#kg-center)" />
                {edges.map((e, i) => {
                  const a = nodeById[e.source];
                  const b = nodeById[e.target];
                  if (!a || !b) return null;
                  const active = activeId === e.source || activeId === e.target;
                  return (
                    <line
                      key={i}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={active ? "var(--primary)" : "var(--border)"}
                      strokeOpacity={active ? 0.9 : 0.5}
                      strokeWidth={active ? 1.5 : 0.8}
                    />
                  );
                })}
                {visibleNodes.map((n) => {
                  const color = KIND_COLOR[n.kind];
                  const active = activeId === n.id;
                  const isSelected = selectedId === n.id;
                  return (
                    <g
                      key={n.id}
                      onMouseEnter={() => setHover(n.id)}
                      onMouseLeave={() => setHover(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(n.id);
                      }}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={active ? (isSelected ? 10 : 8) : 5}
                        fill={color}
                        stroke={isSelected ? "var(--foreground)" : "var(--background)"}
                        strokeWidth="2"
                      />
                      {active && (
                        <text
                          x={n.x}
                          y={n.y - 14}
                          textAnchor="middle"
                          fontSize="10"
                          fill="var(--foreground)"
                          fontWeight="500"
                        >
                          {n.label.length > 40 ? n.label.slice(0, 40) + "…" : n.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              {hover && !selectedId && (
                <div className="border-border bg-popover/95 pointer-events-none absolute top-3 left-3 rounded-md border px-2.5 py-1.5 text-xs shadow-md backdrop-blur">
                  {nodeById[hover]?.label}
                  <span className="text-muted-foreground ml-2 text-[10px]">
                    {KIND_LABEL[nodeById[hover]?.kind ?? "note"]}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-3 h-[600px] overflow-y-auto pr-1 pb-1">
          <Card>
            <CardHeader className="py-3">
              <CardDescription className="flex items-center gap-1.5">
                <Filter className="h-3 w-3" /> Filters
              </CardDescription>
              <CardTitle className="mt-1 text-sm">Show Entities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pb-3">
              {ALL_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setEnabled((e) => ({ ...e, [k]: !e[k] }))}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                    enabled[k] ? "text-foreground hover:bg-accent/50" : "text-muted-foreground line-through hover:bg-accent/20",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: KIND_COLOR[k] }}
                  />
                  {KIND_LABEL[k]}
                  <span className="ml-auto font-mono text-[10px]">{countsByKind[k]}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedId && nodeById[selectedId] && (
            <Card className="border-primary/50 bg-primary/5 shadow-md">
              <CardHeader className="py-3">
                <CardDescription>Selected Inspector</CardDescription>
                <CardTitle className="mt-1 line-clamp-3 text-sm leading-snug">
                  {nodeById[selectedId].label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-12">Kind</span>
                  <Badge variant="outline" style={{ borderColor: KIND_COLOR[nodeById[selectedId].kind] }}>
                    {KIND_LABEL[nodeById[selectedId].kind]}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-12">ID</span>
                  <span className="font-mono text-[10px] bg-accent px-1.5 py-0.5 rounded text-muted-foreground truncate flex-1">
                    {nodeById[selectedId].id.split('_')[1]}
                  </span>
                </div>
                
                <div className="pt-2">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Incoming Links</div>
                  <div className="space-y-1">
                    {edges.filter(e => e.target === selectedId).length === 0 && (
                      <div className="text-xs text-muted-foreground italic">None</div>
                    )}
                    {edges.filter(e => e.target === selectedId).map(e => (
                      <div key={e.source} className="text-xs flex items-center gap-1.5 bg-background border border-border/50 p-1.5 rounded-md">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: KIND_COLOR[nodeById[e.source]?.kind ?? "note"] }} />
                        <span className="truncate flex-1" title={nodeById[e.source]?.label}>
                          {nodeById[e.source]?.label ?? "Unknown"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-1">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Outgoing Links</div>
                  <div className="space-y-1">
                    {edges.filter(e => e.source === selectedId).length === 0 && (
                      <div className="text-xs text-muted-foreground italic">None</div>
                    )}
                    {edges.filter(e => e.source === selectedId).map(e => (
                      <div key={e.target} className="text-xs flex items-center gap-1.5 bg-background border border-border/50 p-1.5 rounded-md">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: KIND_COLOR[nodeById[e.target]?.kind ?? "note"] }} />
                        <span className="truncate flex-1" title={nodeById[e.target]?.label}>
                          {nodeById[e.target]?.label ?? "Unknown"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3">
                  <Button asChild size="sm" className="w-full text-xs">
                    <a href={getEntityHref(selectedId, nodeById[selectedId].kind)}>
                      Open {KIND_LABEL[nodeById[selectedId].kind]}
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
