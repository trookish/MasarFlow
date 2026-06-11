"use client";
import * as React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  type NodeTypes,
  type EdgeMarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Server, Package, FileCode2, Database, MapPin, Box } from "lucide-react";
import { cn } from "@/lib/utils";

export type ArchNodeType = "service" | "module" | "class" | "so" | "scene" | "prefab" | "script";
export type ArchEdgeKind = "depends" | "calls" | "instantiates" | "flows-into" | "references";

export interface ArchNodeData extends Record<string, unknown> { id: string; name: string; type: ArchNodeType; systemName?: string; }
export interface ArchEdgeData extends Record<string, unknown> { kind: ArchEdgeKind; }

const NODE_TYPE_META: Record<ArchNodeType, { label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string; bg: string }> = {
  service: { label: "Service", icon: Server, color: "var(--graph-system)", bg: "color-mix(in oklch, var(--graph-system) 18%, transparent)" },
  module: { label: "Module", icon: Package, color: "var(--primary)", bg: "color-mix(in oklch, var(--primary) 16%, transparent)" },
  class: { label: "Class", icon: FileCode2, color: "var(--graph-spec)", bg: "color-mix(in oklch, var(--graph-spec) 16%, transparent)" },
  so: { label: "ScriptableObject", icon: Database, color: "var(--graph-memory)", bg: "color-mix(in oklch, var(--graph-memory) 16%, transparent)" },
  scene: { label: "Scene", icon: MapPin, color: "var(--graph-task)", bg: "color-mix(in oklch, var(--graph-task) 16%, transparent)" },
  prefab: { label: "Prefab", icon: Box, color: "var(--graph-doc)", bg: "color-mix(in oklch, var(--graph-doc) 16%, transparent)" },
  script: { label: "Script", icon: FileCode2, color: "var(--graph-commit)", bg: "color-mix(in oklch, var(--graph-commit) 16%, transparent)" },
};

const EDGE_META: Record<ArchEdgeKind, { label: string; color: string; dashed: boolean }> = {
  depends: { label: "depends on", color: "var(--info)", dashed: false },
  calls: { label: "calls", color: "var(--primary)", dashed: false },
  instantiates: { label: "instantiates", color: "var(--warning)", dashed: true },
  "flows-into": { label: "flows into", color: "var(--success)", dashed: false },
  references: { label: "references", color: "var(--muted-foreground)", dashed: true },
};

function ArchNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as ArchNodeData;
  const meta = NODE_TYPE_META[d.type] ?? NODE_TYPE_META.module;
  const Icon = meta.icon;
  return (
    <div
      className={cn("group relative min-w-[160px] rounded-lg border bg-card px-3 py-2 shadow-sm transition-all", selected ? "border-primary ring-2 ring-primary/30 scale-[1.03]" : "border-border hover:border-foreground/30")}
      style={{ borderLeftWidth: 3, borderLeftColor: meta.color }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-border" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-border" />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-border" id="t" />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-border" id="s" />
      <div className="flex items-center gap-1.5">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded" style={{ backgroundColor: meta.bg, color: meta.color }}>
          <Icon className="h-3 w-3" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold leading-tight">{d.name}</div>
          {d.systemName && <div className="truncate text-[9px] text-muted-foreground">{d.systemName}</div>}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/70">{meta.label}</span>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { arch: ArchNodeView };

export interface ArchGraphNode { id: string; name: string; type: ArchNodeType; systemName?: string; systemId?: string | null; }
export interface ArchGraphEdge { id: string; source: string; target: string; kind: ArchEdgeKind; }

interface ArchGraphProps {
  nodes: ArchGraphNode[];
  edges: ArchGraphEdge[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  showMiniMap?: boolean;
}

function autoLayout(ns: ArchGraphNode[], e: ArchGraphEdge[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const bySystem = new Map<string, ArchGraphNode[]>();
  for (const n of ns) {
    const key = n.systemId ?? "_standalone";
    const arr = bySystem.get(key);
    if (arr) arr.push(n); else bySystem.set(key, [n]);
  }
  let cursorX = 0;
  const systems = Array.from(bySystem.entries());
  for (let si = 0; si < systems.length; si++) {
    const [, members] = systems[si];
    const COL_W = 260;
    const ROW_H = 110;
    members.forEach((m, i) => {
      positions.set(m.id, { x: cursorX + (i % 2) * COL_W, y: Math.floor(i / 2) * ROW_H + si * 80 });
    });
    cursorX += COL_W * 2 + 40;
  }
  for (let i = 0; i < 12; i++) {
    let moved = false;
    for (const e1 of e) {
      const a = positions.get(e1.source);
      const b = positions.get(e1.target);
      if (!a || !b) continue;
      if (Math.abs(a.y - b.y) < 0.01) continue;
      if (b.y <= a.y) continue;
      const targetY = a.y + 110;
      if (Math.abs(b.y - targetY) > 0.5) {
        positions.set(e1.target, { x: b.x, y: targetY });
        moved = true;
      }
    }
    if (!moved) break;
  }
  return positions;
}

function ArchGraphInner({ nodes, edges, selectedId, onSelect, showMiniMap = true }: ArchGraphProps) {
  const initialNodes = React.useMemo<Node[]>(() => {
    const layout = autoLayout(nodes, edges);
    return nodes.map((n) => ({
      id: n.id,
      type: "arch",
      position: layout.get(n.id) ?? { x: 0, y: 0 },
      data: { id: n.id, name: n.name, type: n.type, systemName: n.systemName } as ArchNodeData,
      selected: n.id === selectedId,
    }));
  }, [nodes, edges, selectedId]);

  const initialEdges = React.useMemo<Edge[]>(() =>
    edges.map((ed) => {
      const meta = EDGE_META[ed.kind];
      const baseStyle = {
        stroke: meta.color,
        strokeWidth: 1.4,
        strokeDasharray: meta.dashed ? "4 3" : undefined,
        opacity: selectedId ? 0.4 : 0.85,
      } as React.CSSProperties;
      const highlight = selectedId && (ed.source === selectedId || ed.target === selectedId);
      const edge: Edge<ArchEdgeData> = {
        id: ed.id,
        source: ed.source,
        target: ed.target,
        type: "smoothstep",
        data: { kind: ed.kind },
        style: highlight ? { ...baseStyle, opacity: 1, strokeWidth: 2 } : baseStyle,
        animated: ed.kind === "calls" || ed.kind === "flows-into",
        markerEnd: { type: "arrowclosed" as EdgeMarkerType, color: meta.color, width: 14, height: 14 } as Edge["markerEnd"],
        label: meta.label,
        labelStyle: { fontSize: 9, fill: "var(--muted-foreground)" },
        labelBgStyle: { fill: "var(--background)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      };
      return edge;
    }),
    [edges, selectedId],
  );

  const [flowNodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const rf = React.useRef<unknown>(null);

  React.useEffect(() => { setNodes(initialNodes); setEdges(initialEdges); }, [initialNodes, initialEdges, setNodes, setEdges]);

  React.useEffect(() => {
    const id = window.setTimeout(() => (rf.current as { fitView: (opts: unknown) => void } | null)?.fitView({ padding: 0.18, duration: 320 }), 50);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div ref={wrapper} className="relative h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect?.(n.id)}
        onPaneClick={() => onSelect?.(null)}
        minZoom={0.2}
        maxZoom={2.5}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background gap={24} size={1} color="color-mix(in oklch, var(--border) 80%, transparent)" />
        <Controls position="bottom-right" showInteractive={false} className="!shadow-md" />
        {showMiniMap && (
          <MiniMap pannable zoomable nodeColor={(n) => { const d = n.data as ArchNodeData; return NODE_TYPE_META[d.type]?.color ?? "var(--muted-foreground)"; }} nodeStrokeWidth={2} maskColor="color-mix(in oklch, var(--background) 70%, transparent)" className="!bg-surface/80 !border !border-border !rounded-md" position="top-right" />
        )}
      </ReactFlow>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-12 left-3 flex flex-wrap gap-1.5 rounded-md border border-border bg-surface/85 p-2 text-[9px] backdrop-blur">
      {Object.entries(NODE_TYPE_META).map(([k, m]) => {
        const Icon = m.icon;
        return (
          <span key={k} className="inline-flex items-center gap-1 rounded-sm bg-background/80 px-1.5 py-0.5">
            <Icon className="h-2.5 w-2.5" style={{ color: m.color }} />
            {m.label}
          </span>
        );
      })}
      <span className="ml-1 inline-flex items-center gap-1 rounded-sm bg-background/80 px-1.5 py-0.5 text-muted-foreground">edges:</span>
      {Object.entries(EDGE_META).slice(0, 3).map(([k, m]) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-sm bg-background/80 px-1.5 py-0.5 text-muted-foreground">
          <span className="h-px w-3" style={{ backgroundColor: m.color }} />
          {m.label}
        </span>
      ))}
    </div>
  );
}

export function ArchGraph(props: ArchGraphProps) {
  return (
    <ReactFlowProvider>
      <ArchGraphInner {...props} />
    </ReactFlowProvider>
  );
}
